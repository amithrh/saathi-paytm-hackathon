/**
 * Measure the turn-based phone path without dialling: drives /twilio/call, /twilio/voice and /twilio/gather
 * in-process with live Sarvam (LLM + TTS), the way Twilio would, and prints per-turn webhook latency.
 *   npx tsx scripts/phone-latency.ts [m001|m002]
 */
import { config } from "dotenv";
config({ quiet: true });
import Fastify from "fastify";
import { SarvamChatClient } from "../agent/src/llm.js";
import { JUDGE_LINES } from "../agent/src/script.js";
import { fixedClock } from "../backend/src/clock.js";
import { EventBus } from "../backend/src/events.js";
import { MerchantStore } from "../backend/src/store.js";
import { registerTwilioRoutes } from "../twilio/src/routes.js";
import { CachedSpeechClient } from "../voice/src/cached-speech.js";
import { CallSession, type CallEvent } from "../voice/src/pipeline.js";
import { SarvamSpeechClient } from "../voice/src/speech.js";

const merchantId = process.argv[2] ?? "m001";
const apiKey = process.env.SARVAM_API_KEY!;
const clock = fixedClock("2026-10-31T10:15:00+05:30");
const store = MerchantStore.seeded(clock);
const bus = new EventBus();
const speech = new CachedSpeechClient(new SarvamSpeechClient({ apiKey }), { speaker: "priya" });
const makeSession = (id: string, onEvent: (e: CallEvent) => void) => new CallSession({ merchantId: id, store, clock, llm: new SarvamChatClient({ apiKey }), speech, bus, transport: "phone", onEvent });
const fakeDial = (async () => new Response(JSON.stringify({ sid: "CAtest", status: "queued" }), { status: 201 })) as typeof fetch;
const app = Fastify();
app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_r, b, d) => d(null, Object.fromEntries(new URLSearchParams(String(b)))));
await registerTwilioRoutes(app, { makeSession, publicBaseUrl: "https://example.app", fetchImpl: fakeDial, env: { TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+1", DEMO_PHONE_NUMBER: "+91" } });
await app.ready();
const form = (o: Record<string, string>) => ({ payload: new URLSearchParams(o).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
const act = (x: string) => /action="([^"]+)"/.exec(x)?.[1]?.replace(/&amp;/g, "&").replace("https://example.app", "") ?? "";
const plays = (x: string) => [...x.matchAll(/<Play>([^<]+)<\/Play>/g)].map((m) => m[1]!.replace("https://example.app", ""));

let t = Date.now();
const dial = await app.inject({ method: "POST", url: "/twilio/call", payload: { merchantId } });
console.log(`prepare before dial (briefing + opening TTS): ${Date.now() - t} ms`);
const token = dial.json().token;
t = Date.now();
let res = await app.inject({ method: "POST", url: `/twilio/voice?token=${token}`, ...form({}) });
console.log(`answer webhook -> TwiML: ${Date.now() - t} ms, audio ${(await app.inject({ url: plays(res.body)[0]! })).rawPayload.length} bytes`);
const rows: Array<Record<string, unknown>> = [];
for (const line of JUDGE_LINES[store.get(merchantId).language]) {
  t = Date.now();
  const r = await app.inject({ method: "POST", url: act(res.body), ...form({ SpeechResult: line }) });
  const webhookMs = Date.now() - t;
  // Twilio fetches each <Play> as it reaches it; fetch them all (as the caller "listens") before the next turn.
  let bytes = 0;
  for (const u of plays(r.body)) bytes += (await app.inject({ url: u })).rawPayload.length - 44;
  rows.push({ merchant: line, webhookMs, sentences: plays(r.body).length, replySeconds: +(bytes / 16000).toFixed(1), allAudioReadyMs: Date.now() - t, hangup: r.body.includes("<Hangup/>") });
  res = r;
}
console.table(rows);
console.log("counters", store.counters(merchantId));
await app.close();
