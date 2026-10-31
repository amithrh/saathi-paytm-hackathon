/**
 * Scripted run of the demo against a running server (npm run demo in another terminal).
 * Drives the same WebSocket the browser call screen uses, so the dashboard updates live.
 *
 *   npm run record-demo                       # Ravi, typed judge lines, plays audio through the speakers
 *   npm run record-demo -- --merchant m002    # Lakshmi in Kannada
 *   npm run record-demo -- --voice            # judge lines synthesised with a male voice and sent as audio (exercises STT)
 *   npm run record-demo -- --no-play          # silent, as fast as the APIs allow (automated check)
 *
 * Writes recordings/<stamp>-<merchant>.wav and .md, prints the latency table, exits 1 if the flow did not complete.
 */
import { config } from "dotenv";
config({ quiet: true });
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { JUDGE_LINES } from "../agent/src/script.js";
import type { Language, MerchantSnapshot, TurnLatency } from "../shared/types.js";
import { concatInt16, pcm16ToWav, resample, wavToPcm16 } from "../voice/src/audio.js";
import { CachedSpeechClient } from "../voice/src/cached-speech.js";
import { SarvamSpeechClient } from "../voice/src/speech.js";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : dflt;
};
const merchantId = opt("--merchant", "m001");
const server = opt("--server", "http://localhost:3000").replace(/\/$/, "");
const voiceMode = flag("--voice");
const play = !flag("--no-play") && process.platform === "darwin";
const outDir = opt("--out", "recordings");
const ringMs = Number(opt("--ring-ms", "2000"));

const log = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);

const health = await fetch(`${server}/api/health`).then((r) => r.json()).catch(() => undefined);
if (!health) {
  console.error(`No server at ${server}. Start it first: npm run demo`);
  process.exit(2);
}
const before = (await fetch(`${server}/api/merchants/${merchantId}/snapshot`).then((r) => r.json())) as MerchantSnapshot;
const lang: Language = before.merchant.language;
const lines = JUDGE_LINES[lang];
log(`merchant ${before.merchant.shopName} (${lang}), clock ${before.clockIst}, mode ${voiceMode ? "voice" : "text"}, play ${play}`);

const apiKey = process.env.SARVAM_API_KEY?.trim();
const speech = voiceMode ? new CachedSpeechClient(apiKey ? new SarvamSpeechClient({ apiKey, speaker: "amit" }) : undefined, { speaker: "amit" }) : undefined;

mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const tmp = path.join(os.tmpdir(), `saathi-${process.pid}`);
mkdirSync(tmp, { recursive: true });

interface Line { who: "saathi" | "merchant"; text: string }
const transcript: Line[] = [];
const latencies: TurnLatency[] = [];
const recording: Int16Array[] = [];
const RATE = 22050;

let playQueue: Promise<void> = Promise.resolve();
function playWav(wav: Buffer, name: string): Promise<void> {
  const pcm = wavToPcm16(wav);
  recording.push(resample(pcm.samples, pcm.sampleRate, RATE));
  if (!play) return Promise.resolve();
  const file = path.join(tmp, `${name}.wav`);
  writeFileSync(file, wav);
  playQueue = playQueue.then(() => new Promise<void>((resolve) => {
    const p = spawn("afplay", [file], { stdio: "ignore" });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  }));
  return playQueue;
}
function addSilence(seconds: number) {
  recording.push(new Int16Array(Math.floor(seconds * RATE)));
}

const ws = new WebSocket(`${server.replace(/^http/, "ws")}/ws/call`);
ws.binaryType = "arraybuffer";

type Pending = { resolve: () => void; test: (m: Record<string, unknown>) => boolean };
const waiters: Pending[] = [];
const waitFor = (test: (m: Record<string, unknown>) => boolean, timeoutMs = 60_000) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timed out waiting for server event")), timeoutMs);
    waiters.push({ resolve: () => { clearTimeout(t); resolve(); }, test });
  });

const turnChunks = new Map<number, { got: number; total: number }>();
let ended = false;
ws.on("message", (data) => {
  const m = JSON.parse(data.toString()) as Record<string, unknown>;
  switch (m.type) {
    case "state":
      log(`state ${m.state}`);
      if (m.state === "ended") ended = true;
      break;
    case "transcript":
      transcript.push({ who: m.speaker as Line["who"], text: String(m.text) });
      log(`${m.speaker === "saathi" ? "SAATHI  " : "MERCHANT"}: ${m.text}`);
      break;
    case "audio": {
      const seq = Number(m.seq);
      const st = turnChunks.get(seq) ?? { got: 0, total: Number(m.chunks) };
      st.got++;
      turnChunks.set(seq, st);
      void playWav(Buffer.from(String(m.wav), "base64"), `s${seq}c${m.chunk}`);
      break;
    }
    case "latency":
      latencies.push(m.latency as TurnLatency);
      break;
    case "error":
      log(`SERVER ERROR: ${m.message}`);
      break;
  }
  for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(); }
});

const turnDone = (seq: number) => waitFor((m) => m.type === "audio" && Number(m.seq) === seq && Number(m.chunk) === Number(m.chunks) - 1);

await new Promise<void>((resolve, reject) => { ws.on("open", () => resolve()); ws.on("error", reject); });
ws.send(JSON.stringify({ type: "start", merchantId }));
await waitFor((m) => m.type === "state" && m.state === "ringing", 90_000);
log(`ringing for ${ringMs} ms`);
await new Promise((r) => setTimeout(r, ringMs));
ws.send(JSON.stringify({ type: "answer" }));
await waitFor((m) => m.type === "state" && m.state === "live");
await turnDone(1);
await playQueue;

let seq = 1;
for (const line of lines) {
  if (ended) break;
  addSilence(0.6);
  if (voiceMode && speech) {
    const t = await speech.tts(line, lang);
    const pcm = wavToPcm16(t.wav);
    recording.push(resample(pcm.samples, pcm.sampleRate, RATE));
    if (play) await playWav(t.wav, `m${seq}`);
    const pcm16k = resample(pcm.samples, pcm.sampleRate, 16000);
    ws.send(Buffer.from(pcm16k.buffer, pcm16k.byteOffset, pcm16k.byteLength));
  } else {
    ws.send(JSON.stringify({ type: "text", text: line }));
  }
  seq++;
  const done = turnDone(seq);
  await Promise.race([done, waitFor((m) => m.type === "state" && m.state === "ended")]);
  await playQueue;
  addSilence(0.4);
}
if (!ended) {
  await Promise.race([waitFor((m) => m.type === "state" && m.state === "ended", 15_000), new Promise((r) => setTimeout(r, 15_000))]);
}
if (!ended) ws.send(JSON.stringify({ type: "hangup" }));
await new Promise((r) => setTimeout(r, 300));
ws.close();

const after = (await fetch(`${server}/api/merchants/${merchantId}/snapshot`).then((r) => r.json())) as MerchantSnapshot;
const wavOut = path.join(outDir, `${stamp}-${merchantId}.wav`);
writeFileSync(wavOut, pcm16ToWav(concatInt16(recording), RATE));
const md = [
  `# Saathi demo run: ${after.merchant.shopName} (${lang})`,
  ``,
  `Clock: ${after.clockIst}. Mode: ${voiceMode ? "voice (judge lines synthesised and sent as audio)" : "text"}.`,
  ``,
  ...transcript.map((l) => `**${l.who === "saathi" ? "Saathi" : "Merchant"}:** ${l.text}\n`),
  `## Latency (ms)`,
  ``,
  `| turn | STT | LLM | LLM calls | tools | TTS to first audio | total |`,
  `|---|---|---|---|---|---|---|`,
  ...latencies.map((l) => `| ${l.turn} | ${l.sttMs} | ${l.llmMs} | ${l.llmCalls} | ${l.toolsMs} | ${l.ttsMs} | ${l.totalMs} |`),
  ``,
  `Counters: recovered ₹${after.counters.recovered}, collected ₹${after.counters.collected}, offered ₹${after.counters.offered}.`,
].join("\n");
writeFileSync(wavOut.replace(/\.wav$/, ".md"), md);

console.log("\nLatency (ms):");
console.table(latencies.map((l) => ({ turn: l.turn, stt: l.sttMs, llm: l.llmMs, llmCalls: l.llmCalls, tools: l.toolsMs, ttsFirstAudio: l.ttsMs, total: l.totalMs })));
console.log(`Counters: ${JSON.stringify(after.counters)}`);
console.log(`Saved ${wavOut} and the transcript next to it.`);

const udhaar = after.udhaar.find((u) => u.status !== "outstanding");
const loan = after.loanOffers[0];
const ok = ended && Boolean(udhaar) && Boolean(loan) && after.counters.recovered > 0 && after.counters.offered > 0;
if (!ok) {
  console.error(`\nFLOW INCOMPLETE: ended=${ended} reminder=${Boolean(udhaar)} loan=${Boolean(loan)} counters=${JSON.stringify(after.counters)}`);
  process.exit(1);
}
console.log("\nFlow complete: reminder sent, loan accepted and routed for approval, call ended by Saathi.");
process.exit(0);
