import type { Language } from "../../shared/types.js";
import { pcm16ToWav, tone } from "./audio.js";

export interface TtsResult {
  wav: Buffer;
  ms: number;
}

export interface SttResult {
  text: string;
  ms: number;
}

export interface SpeechClient {
  tts(text: string, lang: Language): Promise<TtsResult>;
  /** `wav` is a 16-bit PCM WAV file (mono, any common rate). */
  stt(wav: Buffer, lang: Language): Promise<SttResult>;
}

export interface SarvamSpeechOptions {
  apiKey: string;
  baseUrl?: string;
  ttsModel?: string;
  speaker?: string;
  sttModel?: string;
  pace?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class SarvamSpeechClient implements SpeechClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: SarvamSpeechOptions) {
    this.base = opts.baseUrl ?? "https://api.sarvam.ai";
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async post(path: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20_000);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, { ...init, signal: ctrl.signal, headers: { "api-subscription-key": this.opts.apiKey, ...(init.headers as Record<string, string> | undefined) } });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Sarvam ${path} ${res.status}: ${text.slice(0, 300)}`);
      }
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async tts(text: string, lang: Language): Promise<TtsResult> {
    const started = Date.now();
    const res = await this.post("/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target_language_code: lang, speaker: this.opts.speaker ?? "priya", model: this.opts.ttsModel ?? "bulbul:v3", pace: this.opts.pace ?? 1.0 }),
    });
    const json = (await res.json()) as { audios?: string[] };
    const b64 = json.audios?.[0];
    if (!b64) throw new Error("Sarvam TTS returned no audio");
    return { wav: Buffer.from(b64, "base64"), ms: Date.now() - started };
  }

  async stt(wav: Buffer, lang: Language): Promise<SttResult> {
    const started = Date.now();
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "utterance.wav");
    form.append("model", this.opts.sttModel ?? "saarika:v2.5");
    form.append("language_code", lang);
    const res = await this.post("/speech-to-text", { method: "POST", body: form });
    const json = (await res.json()) as { transcript?: string };
    return { text: (json.transcript ?? "").trim(), ms: Date.now() - started };
  }
}

/** Deterministic stand-in for tests and offline rehearsal: TTS is a short tone, STT returns scripted text. */
export class FakeSpeechClient implements SpeechClient {
  ttsCalls: Array<{ text: string; lang: Language }> = [];
  sttCalls: Array<{ bytes: number; lang: Language }> = [];
  constructor(private readonly transcripts: string[] = [], private readonly delayMs = 0) {}
  async tts(text: string, lang: Language): Promise<TtsResult> {
    this.ttsCalls.push({ text, lang });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const seconds = Math.min(3, Math.max(0.3, text.length / 60));
    return { wav: pcm16ToWav(tone(440, seconds, 22050), 22050), ms: this.delayMs };
  }
  async stt(wav: Buffer, lang: Language): Promise<SttResult> {
    this.sttCalls.push({ bytes: wav.length, lang });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    return { text: this.transcripts.shift() ?? "", ms: this.delayMs };
  }
}
