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
  /** Words Twilio's recogniser should favour. Comma separated in the TwiML. */
  hints?: readonly string[];
  /** e.g. "phone_call". Omitted when undefined. */
  speechModel?: string;
}

/** Vocabulary the demo turns expect: yes/no, the actions, the customer names. */
export const SPEECH_HINTS: Record<Language, readonly string[]> = {
  "hi-IN": ["हाँ", "हां", "नहीं", "भेजो", "भेज दो", "रिमाइंडर", "लोन", "चाहिए", "आगे बढ़ो", "ठीक है", "धन्यवाद", "सुरेश", "Suresh", "reminder", "loan"],
  "en-IN": ["yes", "no", "send", "reminder", "loan", "go ahead", "okay", "thank you", "Arjun", "Neha"],
  "kn-IN": ["ಹೌದು", "ಇಲ್ಲ", "ಬೇಡ", "ಕಳಿಸಿ", "ರಿಮೈಂಡರ್", "ಲೋನ್", "ಬೇಕು", "ಮುಂದುವರಿಸಿ", "ಸರಿ", "ಧನ್ಯವಾದಗಳು", "ಮಂಜುನಾಥ್", "Manjunath", "reminder", "loan"],
};

/** speechModel from env: default phone_call; TWILIO_SPEECH_MODEL=off drops the attribute if the account rejects it. */
export function speechModelFromEnv(env: NodeJS.ProcessEnv): string | undefined {
  const v = env.TWILIO_SPEECH_MODEL?.trim();
  if (v === undefined || v === "") return "phone_call";
  return v === "off" || v === "none" ? undefined : v;
}

/** Play Saathi's turn, then listen. Audio inside <Gather> so the merchant can barge in. */
export function playThenGatherTwiml(i: GatherTwimlInput): string {
  const plays = i.audioUrls.map((u) => `<Play>${xmlEsc(u)}</Play>`).join("");
  const hints = i.hints?.length ? ` hints="${xmlEsc(i.hints.join(","))}"` : "";
  const model = i.speechModel ? ` speechModel="${xmlEsc(i.speechModel)}"` : "";
  return `${XML}<Response><Gather input="speech" language="${i.language}"${model}${hints} speechTimeout="auto" actionOnEmptyResult="true" method="POST" action="${xmlEsc(i.actionUrl)}">${plays}</Gather></Response>`;
}

export const LOW_CONFIDENCE = 0.5;
const AFFIRMATIVE = /^(yes please|yeah|yep|sure|हाँ|हां|हा|हाँ जी|हां जी|जी|जी हाँ|यस|yes|haan|han|ha|ok|okay|ओके|ठीक है|ಹೌದು|ಹೂಂ|ಹೂ|ಸರಿ)$/i;
const NEGATIVE = /^(नहीं|नही|ना|मत|no|nahi|nahin|ಇಲ್ಲ|ಬೇಡ)$/i;

export interface MerchantUtterance {
  /** What the agent receives. */
  agentText: string;
  /** What the transcript shows: the raw recognition with a tag. */
  display: string;
  lowConfidence: boolean;
}

/**
 * Twilio's recogniser mishears short Hindi ("haan" -> "यस!", "एप्स!", "इफेक्टिव!"). Clear yes/no words pass
 * through; a short or low-confidence result is wrapped so the agent asks a one-line yes/no confirmation
 * instead of acting on noise.
 */
export function prepareMerchantText(said: string, confidenceRaw: string | undefined): MerchantUtterance {
  const raw = said.trim();
  const confidence = confidenceRaw === undefined || confidenceRaw === "" ? undefined : Number(confidenceRaw);
  const tag = `(phone STT${confidence !== undefined && Number.isFinite(confidence) ? `, ${confidence.toFixed(2)}` : ""})`;
  const display = `${raw || "…"} ${tag}`;
  const bare = raw.replace(/[!?.,।|]/g, "").trim();
  const tokens = bare.split(/\s+/).filter(Boolean);
  // Clear yes/no/okay words pass through as heard ("ठीक है" after "anything else?" is a goodbye, not a yes).
  if (AFFIRMATIVE.test(bare) || NEGATIVE.test(bare)) return { agentText: raw, display, lowConfidence: false };
  const low = (confidence !== undefined && Number.isFinite(confidence) && confidence < LOW_CONFIDENCE) || tokens.length <= 1;
  if (!low || !raw) return { agentText: raw, display, lowConfidence: false };
  return {
    agentText: `[phone STT, low confidence: heard "${raw}". Likely a yes or no. Do not call any tool; ask one short yes-or-no confirmation of your last question.]`,
    display,
    lowConfidence: true,
  };
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
  "en-IN": "Yes, please go ahead.",
};
