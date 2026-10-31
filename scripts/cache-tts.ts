/**
 * Pre-synthesise every line of the scripted scene (both merchants, Saathi in priya's voice and the
 * judge's lines in amit's voice) into recordings/cache so `npm run demo:offline` and
 * `npm run record-demo` need no network. Run while online, before the demo.
 */
import { config } from "dotenv";
config({ quiet: true });
import { sceneLines } from "../agent/src/scripted-brain.js";
import { JUDGE_LINES } from "../agent/src/script.js";
import type { Language } from "../shared/types.js";
import { splitSentences } from "../voice/src/audio.js";
import { CachedSpeechClient } from "../voice/src/cached-speech.js";
import { SarvamSpeechClient } from "../voice/src/speech.js";

const key = process.env.SARVAM_API_KEY?.trim();
if (!key) {
  console.error("SARVAM_API_KEY missing in .env");
  process.exit(2);
}
const saathi = new CachedSpeechClient(new SarvamSpeechClient({ apiKey: key }), { speaker: "priya" });
const judge = new CachedSpeechClient(new SarvamSpeechClient({ apiKey: key, speaker: "amit" }), { speaker: "amit" });

const jobs: Array<{ client: CachedSpeechClient; text: string; lang: Language }> = [];
for (const [merchantId, lang] of [["m001", "hi-IN"], ["m002", "kn-IN"], ["m003", "en-IN"]] as Array<[string, Language]>) {
  // The pipeline splits speech by sentence before TTS, so cache the chunks exactly as it will request them.
  for (const line of sceneLines(merchantId)) for (const chunk of splitSentences(line)) jobs.push({ client: saathi, text: chunk, lang });
  for (const line of JUDGE_LINES[lang]) jobs.push({ client: judge, text: line, lang });
}
let bytes = 0;
let cached = 0;
let fetched = 0;
for (const j of jobs) {
  const had = j.client.has(j.text, j.lang);
  const r = await j.client.tts(j.text, j.lang);
  bytes += r.wav.length;
  if (had) cached++;
  else fetched++;
  process.stdout.write(`${had ? "cached " : "fetched"} ${j.lang} ${j.text.slice(0, 48)}…\n`);
}
console.log(`\n${jobs.length} lines, ${fetched} fetched now, ${cached} already cached, ${(bytes / 1_048_576).toFixed(1)} MB in ${saathi.dir}`);
