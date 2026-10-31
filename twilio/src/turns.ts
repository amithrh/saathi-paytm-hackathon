import { randomUUID } from "node:crypto";
import type { Language } from "../../shared/types.js";
import { concatInt16, pcm16ToWav, resample, wavToPcm16 } from "../../voice/src/audio.js";

/** Telephone-quality WAV: 8 kHz mono PCM16, which Twilio <Play> accepts without transcoding. */
export const PHONE_RATE = 8000;

/** Join TTS chunks (any rate) into one 8 kHz mono WAV with a short gap between sentences. */
export function joinForPhone(wavs: Buffer[], gapMs = 120): Buffer {
  const gap = new Int16Array(Math.round((PHONE_RATE * gapMs) / 1000));
  const parts: Int16Array[] = [];
  wavs.forEach((w, i) => {
    const pcm = wavToPcm16(w);
    parts.push(resample(pcm.samples, pcm.sampleRate, PHONE_RATE));
    if (i < wavs.length - 1) parts.push(gap);
  });
  return pcm16ToWav(concatInt16(parts), PHONE_RATE);
}

/**
 * In-memory store of per-turn audio that Twilio fetches over HTTPS. Bounded; oldest evicted.
 * An entry may be pending: Twilio is given the URL before the audio exists and the fetch waits for it.
 */
export class PhoneAudioStore {
  private readonly files = new Map<string, Buffer | Promise<Buffer>>();
  constructor(private readonly max = 300) {}
  put(wav: Buffer | Promise<Buffer>): string {
    const id = randomUUID().replace(/-/g, "");
    this.files.set(id, wav);
    while (this.files.size > this.max) this.files.delete(this.files.keys().next().value as string);
    return id;
  }
  /** Reserve an id now, fill it later. */
  pending(): { id: string; resolve: (wav: Buffer) => void } {
    let resolve: (wav: Buffer) => void = () => undefined;
    const p = new Promise<Buffer>((r) => (resolve = r));
    const id = this.put(p);
    p.then((wav) => this.files.has(id) && this.files.set(id, wav));
    return { id, resolve };
  }
  get(id: string): Buffer | Promise<Buffer> | undefined {
    return this.files.get(id);
  }
  get size(): number {
    return this.files.size;
  }
}

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const XML = `<?xml version="1.0" encoding="UTF-8"?>`;

export interface GatherTwimlInput {
  audioUrls: string[];
  actionUrl: string;
  language: Language;
}

/** Play Saathi's turn, then listen. Audio inside <Gather> so the merchant can barge in. */
export function playThenGatherTwiml(i: GatherTwimlInput): string {
  const plays = i.audioUrls.map((u) => `<Play>${xmlEsc(u)}</Play>`).join("");
  return `${XML}<Response><Gather input="speech" language="${i.language}" speechTimeout="auto" actionOnEmptyResult="true" method="POST" action="${xmlEsc(i.actionUrl)}">${plays}</Gather></Response>`;
}

/** Play the goodbye and hang up. */
export function playThenHangupTwiml(audioUrls: string[]): string {
  return `${XML}<Response>${audioUrls.map((u) => `<Play>${xmlEsc(u)}</Play>`).join("")}<Hangup/></Response>`;
}

/** Last resort only: something failed and we have no Sarvam audio to play. */
export function errorTwiml(message: string): string {
  return `${XML}<Response><Say language="en-IN">${xmlEsc(message)}</Say><Hangup/></Response>`;
}

/** Short "go ahead" prompt when the merchant said nothing. */
export const REPROMPT: Record<Language, string> = {
  "hi-IN": "हाँ, बोलिए।",
  "kn-IN": "ಹೌದು, ಹೇಳಿ.",
};
