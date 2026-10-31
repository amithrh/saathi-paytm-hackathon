/**
 * Backup demo video, no screen-recording permission needed.
 *   npx tsx scripts/make-video.ts            -> recordings/saathi-demo.mp4
 * Starts its own server on PORT_VIDEO (default 3300) with live Sarvam brain and voice, no Twilio, no WhatsApp,
 * records the fleet -> Start demo -> dashboard -> browser call -> approve/disburse -> back to fleet with
 * Playwright at 1920x1080, rebuilds the call audio on the same clock, adds title and end cards, muxes with ffmpeg.
 */
import { config } from "dotenv";
config({ quiet: true });
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";
import WebSocket from "ws";
import { JUDGE_LINES } from "../agent/src/script.js";
import { pcm16ToWav, resample, wavToPcm16 } from "../voice/src/audio.js";
import { CachedSpeechClient } from "../voice/src/cached-speech.js";
import { SarvamSpeechClient } from "../voice/src/speech.js";

const PORT = Number(process.env.PORT_VIDEO ?? 3300);
const BASE = `http://localhost:${PORT}`;
const MERCHANT = process.argv[2] ?? "m001";
const OUT_DIR = path.resolve("recordings");
const WORK = path.join(OUT_DIR, "video-work");
const OUT = path.join(OUT_DIR, MERCHANT === "m001" ? "saathi-demo.mp4" : `saathi-demo-${MERCHANT}.mp4`);
const W = 1920, H = 1080, RATE = 22050, TITLE_S = 3, END_S = 2;
const log = (s: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ---- server: live brain and voice, no phone, no WhatsApp, calm opening --------------------------------
const server = spawn("npx", ["tsx", "server/main.ts"], {
  // Twilio vars stay loaded (so the UI shows a configured phone path) but DEMO_DIAL=browser means no call is
  // placed; the WhatsApp sender is blanked so the reminder renders as the mock bubble instead of a live send.
  env: { ...process.env, PORT: String(PORT), SAATHI_FAKE_NOW: "2026-10-31T10:15:00+05:30", DEMO_CONTROL_KEY: "test", DEMO_DIAL: "browser",
    TWILIO_WHATSAPP_FROM: "", SIMULATED_PAYMENT_DELAY_MS: "12000" },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => process.env.VERBOSE && process.stdout.write(d));
const stopServer = () => server.kill("SIGTERM");
process.on("exit", stopServer);
for (let i = 0; i < 60; i++) {
  if (await fetch(`${BASE}/api/health`).then((r) => r.ok).catch(() => false)) break;
  await sleep(500);
}
log(`server up on ${PORT}`);

// ---- title and end cards ------------------------------------------------------------------------------
const browser = await chromium.launch();
async function card(file: string, html: string) {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.setContent(`<html><body style="margin:0;width:${W}px;height:${H}px;background:linear-gradient(135deg,#0f2d6b,#1d4ed8);color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:28px">${html}</body></html>`);
  await p.screenshot({ path: file });
  await p.close();
}
await card(path.join(WORK, "title.png"), `<div style="font-size:120px;font-weight:800">Saathi</div><div style="font-size:48px;font-weight:600;max-width:1500px">Autonomous service and sales teammate for Paytm merchants</div><div style="font-size:36px;opacity:.85">Track 3 · Team Saathi · Paytm Build for India AI Hackathon, Bengaluru</div>`);
await card(path.join(WORK, "end.png"), `<div style="font-size:84px;font-weight:800">Saathi</div><div style="font-size:40px">github.com/amithrh/saathi-paytm-hackathon</div><div style="font-size:40px">saathi.deepcycle.app/fleet</div><div style="font-size:30px;opacity:.8">Sarvam Saaras, Bulbul and LLM · merchant backend simulated · human approves the money step</div>`);

// ---- record ---------------------------------------------------------------------------------------------
const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: WORK, size: { width: W, height: H } } });
// Fleet opens at the week baseline, not wherever an earlier run left it.
await fetch(`${BASE}/api/demo/reset`, { method: "POST", headers: { "Content-Type": "application/json", "X-Demo-Key": "test" }, body: "{}" });
const page: Page = await ctx.newPage();
const t0 = Date.now();
const at = () => Date.now() - t0;
await page.goto(`${BASE}/fleet?key=test&present=1`);
await page.waitForSelector("#startDemo:visible", { timeout: 15000 });
await page.selectOption("#startWho", MERCHANT);
await sleep(3000);
log("Start demo");
await page.click("#startDemo");
await page.waitForURL(/\/dashboard\?merchant=/, { timeout: 90_000 });
log(`on dashboard at ${(at() / 1000).toFixed(1)} s`);
await sleep(1500);

// ---- the call over the browser transport, audio laid on the same clock ---------------------------------
interface Clip { atMs: number; wav: Buffer }
const clips: Clip[] = [];
let cursor = 0; // ms on the video clock where the audio track is free again
const durMs = (wav: Buffer) => { const p = wavToPcm16(wav); return (p.samples.length / p.sampleRate) * 1000; };
const lang = MERCHANT === "m002" ? "kn-IN" : MERCHANT === "m003" ? "en-IN" : "hi-IN";
const judge = new CachedSpeechClient(process.env.SARVAM_API_KEY ? new SarvamSpeechClient({ apiKey: process.env.SARVAM_API_KEY, speaker: "amit" }) : undefined, { speaker: "amit" });

const ws = new WebSocket(`ws://localhost:${PORT}/ws/call`);
let lastAudio = 0;
let ended = false;
const waiters: Array<{ test: (m: Record<string, unknown>) => boolean; resolve: () => void }> = [];
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString()) as Record<string, unknown>;
  if (m.type === "audio") {
    const wav = Buffer.from(String(m.wav), "base64");
    const start = Math.max(at(), cursor);
    clips.push({ atMs: start, wav });
    cursor = start + durMs(wav);
    lastAudio = Date.now();
  }
  if (m.type === "state" && m.state === "ended") ended = true;
  if (m.type === "transcript") log(`${m.speaker}: ${String(m.text).slice(0, 80)}`);
  for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(); }
});
const waitFor = (test: (m: Record<string, unknown>) => boolean, ms = 90_000) => new Promise<void>((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); waiters.push({ test, resolve: () => { clearTimeout(t); res(); } }); });
/** Wait until the reply has been "spoken": all its audio has arrived and the track has played it. */
async function untilSpoken(seq: number) {
  await waitFor((m) => m.type === "audio" && Number(m.seq) === seq && Number(m.chunk) === Number(m.chunks) - 1);
  await sleep(Math.max(0, cursor - at()) + 700);
}
await new Promise<void>((r) => ws.on("open", () => r()));
ws.send(JSON.stringify({ type: "start", merchantId: MERCHANT }));
await waitFor((m) => m.type === "state" && m.state === "ringing");
await sleep(2500);
ws.send(JSON.stringify({ type: "answer" }));
await untilSpoken(1);

let seq = 1;
for (const [i, line] of JUDGE_LINES[lang as "hi-IN"].entries()) {
  if (ended) break;
  const j = await judge.tts(line, lang as "hi-IN");
  const start = Math.max(at(), cursor) + 300;
  clips.push({ atMs: start, wav: j.wav });
  cursor = start + durMs(j.wav);
  await sleep(Math.max(0, cursor - at()));
  ws.send(JSON.stringify({ type: "text", text: line }));
  seq++;
  await untilSpoken(seq);
  if (i === 0) {
    // The reminder just went out: bring the WhatsApp card (bottom of the right column) into view, then back.
    await page.locator("#wa").scrollIntoViewIfNeeded().catch(() => undefined);
    await sleep(3500);
    await page.locator("#gates").scrollIntoViewIfNeeded().catch(() => undefined);
  }
  if (i === 1) {
    // Loan accepted: the human approves, then hands to the lending partner.
    await page.waitForSelector("#approvals button[data-d=approved]", { timeout: 20_000 }).catch(() => undefined);
    await page.click("#approvals button[data-d=approved]").catch(() => log("no approve button"));
    await sleep(2500);
    await page.click("#disburse").catch(() => log("disburse not clickable"));
    await sleep(2500);
  }
}
await sleep(Math.max(0, cursor - at()) + 1500);
ws.close();
await page.click("text=← Back to fleet");
await sleep(4500);
const videoMs = at();
await page.close();
const video = await page.video()!.path();
await ctx.close();
await browser.close();
stopServer();
log(`recorded ${(videoMs / 1000).toFixed(1)} s, ${clips.length} audio clips`);

// ---- audio track on the video clock ---------------------------------------------------------------------
const track = new Int16Array(Math.ceil(((videoMs + 1000) / 1000) * RATE));
for (const c of clips) {
  const p = wavToPcm16(c.wav);
  const s = resample(p.samples, p.sampleRate, RATE);
  const off = Math.round((c.atMs / 1000) * RATE);
  for (let i = 0; i < s.length && off + i < track.length; i++) track[off + i] = Math.max(-32768, Math.min(32767, track[off + i]! + s[i]!));
}
const audioPath = path.join(WORK, "audio.wav");
writeFileSync(audioPath, pcm16ToWav(track, RATE));

// ---- mux: title card, recording, end card; audio delayed by the title ----------------------------------
const ff = process.env.FFMPEG ?? "ffmpeg";
execFileSync(ff, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-loop", "1", "-t", String(TITLE_S), "-i", path.join(WORK, "title.png"),
  "-i", video,
  "-loop", "1", "-t", String(END_S), "-i", path.join(WORK, "end.png"),
  "-i", audioPath,
  "-filter_complex",
  `[0:v]scale=${W}:${H},fps=30,format=yuv420p,setsar=1[a];[1:v]scale=${W}:${H},fps=30,format=yuv420p,setsar=1[b];[2:v]scale=${W}:${H},fps=30,format=yuv420p,setsar=1[c];[a][b][c]concat=n=3:v=1:a=0[v];[3:a]adelay=${TITLE_S * 1000}|${TITLE_S * 1000},apad[au]`,
  "-map", "[v]", "-map", "[au]", "-shortest",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
  OUT,
]);
const size = statSync(OUT).size;
log(`wrote ${OUT}: ${(size / 1_048_576).toFixed(1)} MB, about ${((videoMs / 1000) + TITLE_S + END_S).toFixed(0)} s`);
void readdirSync;
process.exit(0);
