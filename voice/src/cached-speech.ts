import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Language } from "../../shared/types.js";
import type { SpeechClient, SttResult, TtsResult } from "./speech.js";

export const DEFAULT_TTS_CACHE_DIR = path.resolve("recordings", "cache");

export function ttsCacheKey(text: string, lang: Language, speaker: string): string {
  return createHash("sha1").update(`${lang}|${speaker}|${text.trim()}`).digest("hex");
}

/**
 * Serves TTS from recordings/cache when the exact line was synthesised before, otherwise asks the
 * inner client and stores the result. With no inner client it is fully offline: cached lines play,
 * anything else fails loudly. STT always needs the inner client.
 */
export class CachedSpeechClient implements SpeechClient {
  hits = 0;
  misses = 0;
  constructor(
    private readonly inner: SpeechClient | undefined,
    private readonly opts: { dir?: string; speaker?: string } = {},
  ) {
    mkdirSync(this.dir, { recursive: true });
  }

  get dir(): string {
    return this.opts.dir ?? DEFAULT_TTS_CACHE_DIR;
  }

  pathFor(text: string, lang: Language): string {
    return path.join(this.dir, `${ttsCacheKey(text, lang, this.opts.speaker ?? "priya")}.wav`);
  }

  has(text: string, lang: Language): boolean {
    return existsSync(this.pathFor(text, lang));
  }

  async tts(text: string, lang: Language): Promise<TtsResult> {
    const file = this.pathFor(text, lang);
    if (existsSync(file)) {
      this.hits++;
      return { wav: readFileSync(file), ms: 0 };
    }
    if (!this.inner) throw new Error(`offline: no cached audio for "${text.slice(0, 40)}…" (run npm run cache-tts while online)`);
    this.misses++;
    const r = await this.inner.tts(text, lang);
    writeFileSync(file, r.wav);
    return r;
  }

  async stt(wav: Buffer, lang: Language): Promise<SttResult> {
    if (!this.inner) throw new Error("offline: speech-to-text needs the network; type the merchant's line instead");
    return this.inner.stt(wav, lang);
  }
}
