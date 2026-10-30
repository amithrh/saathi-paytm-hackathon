import { rms } from "./audio.js";

export interface SegmenterOptions {
  sampleRate: number;
  /** RMS above this counts as speech (16-bit scale). */
  startThreshold?: number;
  /** Silence this long after speech closes the utterance. */
  endSilenceMs?: number;
  /** Utterances shorter than this are dropped as noise. */
  minSpeechMs?: number;
  /** Hard cap; an utterance is emitted when it reaches this length. */
  maxUtteranceMs?: number;
  /** Audio kept from before speech started so the first syllable is not clipped. */
  preRollMs?: number;
}

/**
 * Energy-based voice activity detection that turns a continuous PCM stream into utterances.
 * Used by the Twilio transport (no push-to-talk on a phone). Deterministic and dependency-free.
 */
export class UtteranceSegmenter {
  private readonly opts: Required<SegmenterOptions>;
  private speaking = false;
  private silenceMs = 0;
  private speechMs = 0;
  private buffer: Int16Array[] = [];
  private preRoll: Int16Array[] = [];
  private preRollMsHeld = 0;
  private listeners: Array<(u: Int16Array) => void> = [];

  constructor(opts: SegmenterOptions) {
    this.opts = {
      sampleRate: opts.sampleRate,
      startThreshold: opts.startThreshold ?? 900,
      endSilenceMs: opts.endSilenceMs ?? 700,
      minSpeechMs: opts.minSpeechMs ?? 300,
      maxUtteranceMs: opts.maxUtteranceMs ?? 15_000,
      preRollMs: opts.preRollMs ?? 200,
    };
  }

  onUtterance(fn: (u: Int16Array) => void): void {
    this.listeners.push(fn);
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  push(frame: Int16Array): void {
    const frameMs = (frame.length / this.opts.sampleRate) * 1000;
    const loud = rms(frame) >= this.opts.startThreshold;
    if (!this.speaking) {
      this.preRoll.push(frame);
      this.preRollMsHeld += frameMs;
      while (this.preRollMsHeld > this.opts.preRollMs && this.preRoll.length > 1) {
        const dropped = this.preRoll.shift()!;
        this.preRollMsHeld -= (dropped.length / this.opts.sampleRate) * 1000;
      }
      if (loud) {
        this.speaking = true;
        this.buffer = [...this.preRoll];
        this.preRoll = [];
        this.preRollMsHeld = 0;
        this.speechMs = frameMs;
        this.silenceMs = 0;
      }
      return;
    }
    this.buffer.push(frame);
    this.speechMs += frameMs;
    this.silenceMs = loud ? 0 : this.silenceMs + frameMs;
    if (this.silenceMs >= this.opts.endSilenceMs || this.speechMs >= this.opts.maxUtteranceMs) this.flush();
  }

  /** Force the current utterance out (e.g. the stream ended). */
  flush(): void {
    if (!this.speaking) return;
    const voiced = this.speechMs - this.silenceMs;
    const parts = this.buffer;
    this.speaking = false;
    this.buffer = [];
    this.speechMs = 0;
    this.silenceMs = 0;
    if (voiced < this.opts.minSpeechMs) return;
    const total = parts.reduce((s, p) => s + p.length, 0);
    const out = new Int16Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    for (const l of this.listeners) l(out);
  }
}
