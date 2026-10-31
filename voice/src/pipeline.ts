import { randomUUID } from "node:crypto";
import { SaathiAgent, type AgentTurn } from "../../agent/src/agent.js";
import type { ChatClient } from "../../agent/src/llm.js";
import type { Clock } from "../../backend/src/clock.js";
import type { EventBus } from "../../backend/src/events.js";
import type { MerchantStore } from "../../backend/src/store.js";
import type { CallState, Language, TurnLatency } from "../../shared/types.js";
import { pcm16ToWav, splitSentences } from "./audio.js";
import type { SpeechClient } from "./speech.js";
import type { WhatsAppSender } from "../../whatsapp/src/client.js";

/** Events a transport (browser page, Twilio stream, recorder) receives from a call session. */
export type CallEvent =
  | { type: "state"; state: CallState; callId: string; merchantId: string; language: Language }
  | { type: "transcript"; speaker: "saathi" | "merchant"; text: string }
  | { type: "thinking"; on: boolean }
  | { type: "audio"; wav: Buffer; seq: number; chunk: number; chunks: number; text: string }
  | { type: "latency"; latency: TurnLatency }
  | { type: "error"; message: string };

export interface CallSessionDeps {
  merchantId: string;
  store: MerchantStore;
  clock: Clock;
  llm: ChatClient;
  speech: SpeechClient;
  bus?: EventBus;
  whatsapp?: WhatsAppSender;
  customerPhones?: Record<string, string>;
  transport: string;
  /** Delivered in order; audio chunks for one turn share a `seq`. */
  onEvent: (e: CallEvent) => void;
  log?: (line: string) => void;
  /** How many TTS requests may run at once when a reply is split into sentences. */
  ttsConcurrency?: number;
}

/**
 * The voice loop, independent of how audio arrives: PCM in -> STT -> agent -> TTS -> audio out.
 * Transports feed `handleUtterance` (16 kHz mono PCM) or `handleText`, and render the events.
 */
export class CallSession {
  readonly callId = `call-${randomUUID().slice(0, 8)}`;
  readonly language: Language;
  private readonly agent: SaathiAgent;
  private state: CallState = "idle";
  private seq = 0;
  private turnNo = 0;
  private queue: Promise<void> = Promise.resolve();
  private openingTurn?: AgentTurn;
  private openingAudio?: Promise<Buffer[]>;
  private hungUp = false;
  readonly latencies: TurnLatency[] = [];

  constructor(private readonly deps: CallSessionDeps) {
    const merchant = deps.store.get(deps.merchantId);
    this.language = merchant.language;
    this.agent = new SaathiAgent({ llm: deps.llm, store: deps.store, clock: deps.clock, merchantId: deps.merchantId, callId: this.callId, ...(deps.bus ? { bus: deps.bus } : {}), ...(deps.whatsapp ? { whatsapp: deps.whatsapp } : {}), ...(deps.customerPhones ? { customerPhones: deps.customerPhones } : {}), ...(deps.log ? { log: deps.log } : {}) });
  }

  get currentState(): CallState {
    return this.state;
  }

  /** True once the agent called end_call (the transport should play the goodbye and hang up). */
  get agentEnded(): boolean {
    return this.agent.hasEnded;
  }

  /** Synthesise one line outside the conversation (e.g. a phone re-prompt). Goes through the TTS cache. */
  async speakLine(text: string): Promise<Buffer> {
    return (await this.deps.speech.tts(text, this.language)).wav;
  }

  private setState(state: CallState): void {
    this.state = state;
    this.deps.onEvent({ type: "state", state, callId: this.callId, merchantId: this.deps.merchantId, language: this.language });
    this.deps.bus?.publish({ type: "call", merchantId: this.deps.merchantId, callId: this.callId, state, transport: this.deps.transport });
  }

  /**
   * Ring phase: run pre-call diagnostics, compose the opening and synthesise it,
   * so the greeting plays the instant the merchant answers.
   */
  async prepare(): Promise<void> {
    this.setState("preparing");
    const started = Date.now();
    try {
      await this.agent.prepare();
      this.openingTurn = await this.agent.open();
      const text = this.openingTurn.speech;
      const sentences = splitSentences(text);
      const ttsStart = Date.now();
      this.openingAudio = this.synthesise(sentences);
      const wavs = await this.openingAudio;
      this.latencies.push({ turn: 0, sttMs: 0, llmMs: this.openingTurn.llmMs, toolsMs: this.openingTurn.toolsMs, ttsMs: Date.now() - ttsStart, totalMs: Date.now() - started, llmCalls: this.openingTurn.llmCalls });
      this.deps.log?.(`prepared opening in ${Date.now() - started} ms (${wavs.length} chunks)`);
    } catch (e) {
      this.deps.onEvent({ type: "error", message: (e as Error).message });
      throw e;
    }
    this.setState("ringing");
  }

  /** The merchant picked up. */
  async answer(): Promise<void> {
    if (!this.openingTurn || !this.openingAudio) throw new Error("answer() before prepare()");
    this.setState("live");
    const text = this.openingTurn.speech;
    const wavs = await this.openingAudio;
    this.sayTranscript("saathi", text);
    const seq = ++this.seq;
    const sentences = splitSentences(text);
    wavs.forEach((wav, i) => this.deps.onEvent({ type: "audio", wav, seq, chunk: i, chunks: wavs.length, text: sentences[i] ?? "" }));
    const l0 = this.latencies[0];
    if (l0) this.deps.onEvent({ type: "latency", latency: l0 });
  }

  /** Merchant audio for one utterance: 16 kHz mono PCM. */
  handleUtterance(pcm16k: Int16Array): Promise<void> {
    return this.enqueue(async () => {
      if (this.state !== "live") return;
      const started = Date.now();
      const wav = pcm16ToWav(pcm16k, 16000);
      this.deps.onEvent({ type: "thinking", on: true });
      let stt;
      try {
        stt = await this.deps.speech.stt(wav, this.language);
      } catch (e) {
        this.deps.onEvent({ type: "thinking", on: false });
        this.deps.onEvent({ type: "error", message: `STT failed: ${(e as Error).message}` });
        return;
      }
      this.deps.log?.(`stt ${stt.ms} ms: "${stt.text}"`);
      await this.runTurn(stt.text, stt.ms, started);
    });
  }

  /** Typed fallback when the microphone is not usable. */
  handleText(text: string, opts: { display?: string } = {}): Promise<void> {
    return this.enqueue(async () => {
      if (this.state !== "live") return;
      this.deps.onEvent({ type: "thinking", on: true });
      await this.runTurn(text, 0, Date.now(), opts.display);
    });
  }

  hangup(reason = "hangup"): void {
    if (this.hungUp) return;
    this.hungUp = true;
    this.deps.log?.(`call ended: ${reason}`);
    this.setState("ended");
  }

  private async runTurn(merchantText: string, sttMs: number, started: number, display?: string): Promise<void> {
    this.turnNo++;
    this.sayTranscript("merchant", display ?? (merchantText || "(unclear)"));
    let turn: AgentTurn;
    try {
      turn = await this.agent.respond(merchantText);
    } catch (e) {
      this.deps.onEvent({ type: "thinking", on: false });
      this.deps.onEvent({ type: "error", message: `Agent failed: ${(e as Error).message}` });
      return;
    }
    const sentences = splitSentences(turn.speech);
    const ttsStart = Date.now();
    const seq = ++this.seq;
    let firstAudioAt = 0;
    if (turn.speech) this.sayTranscript("saathi", turn.speech);
    const wavs = await this.synthesise(sentences, (wav, i) => {
      if (!firstAudioAt) firstAudioAt = Date.now();
      this.deps.onEvent({ type: "audio", wav, seq, chunk: i, chunks: sentences.length, text: sentences[i] ?? "" });
    });
    const latency: TurnLatency = {
      turn: this.turnNo,
      sttMs,
      llmMs: turn.llmMs,
      toolsMs: turn.toolsMs,
      ttsMs: (firstAudioAt || Date.now()) - ttsStart,
      totalMs: (firstAudioAt || Date.now()) - started,
      llmCalls: turn.llmCalls,
    };
    this.latencies.push(latency);
    this.deps.onEvent({ type: "thinking", on: false });
    this.deps.onEvent({ type: "latency", latency });
    this.deps.bus?.publish({ type: "latency", merchantId: this.deps.merchantId, callId: this.callId, latency });
    this.deps.log?.(`turn ${this.turnNo}: stt ${sttMs} ms, llm ${turn.llmMs} ms (${turn.llmCalls} calls), tools ${turn.toolsMs} ms, tts-to-first-audio ${latency.ttsMs} ms, total ${latency.totalMs} ms, ${wavs.length} chunks`);
    if (turn.endCall) {
      // Give the transport time to play the goodbye; it may also hang up sooner.
      const totalSeconds = wavs.reduce((s, w) => s + Math.max(0, (w.length - 44) / (22050 * 2)), 0);
      setTimeout(() => this.hangup("agent ended the call"), Math.min(12_000, totalSeconds * 1000 + 800));
    }
  }

  /** Synthesise sentences with bounded parallelism, delivering in order as each becomes available. */
  private async synthesise(sentences: string[], onChunk?: (wav: Buffer, i: number) => void): Promise<Buffer[]> {
    if (!sentences.length) return [];
    const limit = this.deps.ttsConcurrency ?? 3;
    const results: Buffer[] = new Array(sentences.length);
    let next = 0;
    let delivered = 0;
    const deliver = () => {
      while (delivered < sentences.length && results[delivered]) {
        onChunk?.(results[delivered]!, delivered);
        delivered++;
      }
    };
    const worker = async () => {
      while (next < sentences.length) {
        const i = next++;
        try {
          results[i] = (await this.deps.speech.tts(sentences[i]!, this.language)).wav;
        } catch (e) {
          this.deps.onEvent({ type: "error", message: `TTS failed: ${(e as Error).message}` });
          results[i] = pcm16ToWav(new Int16Array(2205), 22050); // 100 ms of silence keeps ordering intact
        }
        deliver();
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, sentences.length) }, worker));
    deliver();
    return results;
  }

  private sayTranscript(speaker: "saathi" | "merchant", text: string): void {
    this.deps.onEvent({ type: "transcript", speaker, text });
    this.deps.bus?.publish({ type: "transcript", merchantId: this.deps.merchantId, callId: this.callId, speaker, text });
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    const run = this.queue.then(job, job);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
