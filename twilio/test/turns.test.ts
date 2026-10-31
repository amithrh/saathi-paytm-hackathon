import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScriptedBrain } from "../../agent/src/scripted-brain.js";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { LAKSHMI_ID, RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import type { ServerEvent } from "../../shared/types.js";
import { pcm16ToWav, tone, wavToPcm16 } from "../../voice/src/audio.js";
import { CallSession, type CallEvent } from "../../voice/src/pipeline.js";
import { FakeSpeechClient } from "../../voice/src/speech.js";
import { registerTwilioRoutes } from "../src/routes.js";
import { errorTwiml, joinForPhone, PhoneAudioStore, playThenGatherTwiml, playThenHangupTwiml } from "../src/turns.js";

describe("TwiML builders", () => {
  it("plays inside a speech Gather with escaped URLs and the merchant's language", () => {
    const xml = playThenGatherTwiml({ audioUrls: ["https://x.app/twilio/audio/a.wav", "https://x.app/twilio/audio/b.wav"], actionUrl: "https://x.app/twilio/gather?token=t1&x=2", language: "kn-IN" });
    expect(xml).toBe(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="speech" language="kn-IN" speechTimeout="auto" actionOnEmptyResult="true" method="POST" action="https://x.app/twilio/gather?token=t1&amp;x=2"><Play>https://x.app/twilio/audio/a.wav</Play><Play>https://x.app/twilio/audio/b.wav</Play></Gather></Response>`,
    );
    expect(xml).not.toContain("<Say");
  });
  it("plays the goodbye then hangs up", () => {
    expect(playThenHangupTwiml(["https://x/a.wav"])).toBe(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>https://x/a.wav</Play><Hangup/></Response>`);
  });
  it("uses Say only in the error path", () => {
    expect(errorTwiml("Sorry <x>")).toContain("<Say language=\"en-IN\">Sorry &lt;x&gt;</Say><Hangup/>");
  });
});

describe("phone audio", () => {
  it("joins chunks of any rate into one 8 kHz mono WAV with gaps", () => {
    const a = pcm16ToWav(tone(440, 1, 22050), 22050);
    const b = pcm16ToWav(tone(440, 0.5, 16000), 16000);
    const out = wavToPcm16(joinForPhone([a, b], 100));
    expect(out.sampleRate).toBe(8000);
    expect(out.channels).toBe(1);
    expect(out.samples.length).toBe(8000 + 800 + 4000);
  });
  it("store evicts the oldest beyond its cap", () => {
    const s = new PhoneAudioStore(2);
    const a = s.put(Buffer.from("a"));
    s.put(Buffer.from("b"));
    s.put(Buffer.from("c"));
    expect(s.get(a)).toBeUndefined();
    expect(s.size).toBe(2);
  });
});

describe("turn-based phone call over /twilio/voice and /twilio/gather", () => {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const busEvents: ServerEvent[] = [];
  bus.subscribe((e) => busEvents.push(e));
  const speech = new FakeSpeechClient();
  const sessions: CallSession[] = [];
  const makeSession = (merchantId: string, onEvent: (e: CallEvent) => void) => {
    const s = new CallSession({ merchantId, store, clock, llm: new ScriptedBrain(merchantId), speech, bus, transport: "phone", onEvent });
    sessions.push(s);
    return s;
  };
  const fakeFetch = (async () => new Response(JSON.stringify({ sid: "CA1", status: "queued" }), { status: 201 })) as typeof fetch;
  const app = Fastify();
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_r, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
  beforeAll(async () => {
    await registerTwilioRoutes(app, { makeSession, env: { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+1555", DEMO_PHONE_NUMBER: "+9199" }, publicBaseUrl: "https://saathi.example.app", fetchImpl: fakeFetch });
    await app.ready();
  });
  afterAll(() => app.close());

  const form = (o: Record<string, string>) => ({ payload: new URLSearchParams(o).toString(), headers: { "content-type": "application/x-www-form-urlencoded" } });
  const playUrls = (xml: string) => [...xml.matchAll(/<Play>([^<]+)<\/Play>/g)].map((m) => m[1]!);
  const actionOf = (xml: string) => /action="([^"]+)"/.exec(xml)![1]!.replace(/&amp;/g, "&");
  const path = (url: string) => url.replace("https://saathi.example.app", "");

  it("runs the whole Ravi scene: opening, reminder, loan, goodbye and hang-up", async () => {
    const dial = await app.inject({ method: "POST", url: "/twilio/call", payload: { merchantId: RAVI_ID } });
    expect(dial.statusCode).toBe(200);
    const token = dial.json().token as string;

    const voice = await app.inject({ method: "POST", url: `/twilio/voice?token=${token}`, ...form({ CallSid: "CA1" }) });
    expect(voice.headers["content-type"]).toMatch(/xml/);
    expect(voice.body).toContain('<Gather input="speech" language="hi-IN"');
    expect(voice.body).not.toContain("<Stream");
    const [openingUrl] = playUrls(voice.body);
    expect(openingUrl).toMatch(/^https:\/\/saathi\.example\.app\/twilio\/audio\/[0-9a-f]{32}\.wav$/);
    const wav = await app.inject({ method: "GET", url: path(openingUrl!) });
    expect(wav.statusCode).toBe(200);
    expect(wav.headers["content-type"]).toBe("audio/wav");
    expect(wavToPcm16(wav.rawPayload).sampleRate).toBe(8000);
    expect(sessions.at(-1)!.currentState).toBe("live");

    // Merchant says yes to the reminder.
    let next = actionOf(voice.body);
    expect(next).toBe(`https://saathi.example.app/twilio/gather?token=${token}`);
    const t1 = await app.inject({ method: "POST", url: path(next), ...form({ SpeechResult: "हाँ, सुरेश को रिमाइंडर भेजो", Confidence: "0.91" }) });
    expect(playUrls(t1.body)).toHaveLength(1);
    expect(store.get(RAVI_ID).udhaar.find((u) => u.customerId === "c-suresh")!.status).toBe("reminded");

    // Silence once: short re-prompt, no agent turn.
    next = actionOf(t1.body);
    const turnsBefore = sessions.at(-1)!.latencies.length;
    const empty = await app.inject({ method: "POST", url: path(next), ...form({ SpeechResult: "" }) });
    expect(playUrls(empty.body)).toHaveLength(1);
    expect(sessions.at(-1)!.latencies.length).toBe(turnsBefore);
    expect(speech.ttsCalls.at(-1)!.text).toBe("हाँ, बोलिए।");

    // Loan yes, then goodbye ends with <Hangup/>.
    const t2 = await app.inject({ method: "POST", url: path(actionOf(empty.body)), ...form({ SpeechResult: "हाँ लोन चाहिए आगे बढ़ो" }) });
    expect(store.get(RAVI_ID).loanOffers[0]!.status).toBe("awaiting_human_approval");
    const t3 = await app.inject({ method: "POST", url: path(actionOf(t2.body)), ...form({ SpeechResult: "ठीक है धन्यवाद" }) });
    expect(t3.body).toMatch(/<Play>[^<]+<\/Play><Hangup\/><\/Response>$/);
    expect(t3.body).not.toContain("<Gather");

    // Dashboard saw the phone call, both speakers and per-turn latency.
    const states = busEvents.filter((e) => e.type === "call").map((e) => `${(e as { transport: string }).transport}:${(e as { state: string }).state}`);
    expect(states).toEqual(expect.arrayContaining(["phone:ringing", "phone:live"]));
    const speakers = new Set(busEvents.filter((e) => e.type === "transcript").map((e) => (e as { speaker: string }).speaker));
    expect(speakers).toEqual(new Set(["saathi", "merchant"]));
    expect(busEvents.filter((e) => e.type === "latency").length).toBeGreaterThanOrEqual(3);

    // The token is spent once the call ends.
    const late = await app.inject({ method: "POST", url: path(actionOf(t2.body)), ...form({ SpeechResult: "hello" }) });
    expect(late.body).toContain("expired");
  });

  it("listens in Kannada for the Kannada merchant, and two empty results still reach the agent", async () => {
    const dial = await app.inject({ method: "POST", url: "/twilio/call", payload: { merchantId: LAKSHMI_ID } });
    const token = dial.json().token as string;
    const voice = await app.inject({ method: "POST", url: `/twilio/voice?token=${token}`, ...form({}) });
    expect(voice.body).toContain('language="kn-IN"');
    const e1 = await app.inject({ method: "POST", url: path(actionOf(voice.body)), ...form({ SpeechResult: "" }) });
    expect(speech.ttsCalls.at(-1)!.text).toBe("ಹೌದು, ಹೇಳಿ.");
    const before = sessions.at(-1)!.latencies.length;
    await app.inject({ method: "POST", url: path(actionOf(e1.body)), ...form({ SpeechResult: "" }) });
    expect(sessions.at(-1)!.latencies.length).toBe(before + 1);
  });

  it("refuses unknown audio ids and a second answer of the same call", async () => {
    expect((await app.inject({ method: "GET", url: "/twilio/audio/nope.wav" })).statusCode).toBe(404);
    const dial = await app.inject({ method: "POST", url: "/twilio/call", payload: { merchantId: RAVI_ID } });
    const token = dial.json().token as string;
    await app.inject({ method: "POST", url: `/twilio/voice?token=${token}`, ...form({}) });
    const again = await app.inject({ method: "POST", url: `/twilio/voice?token=${token}`, ...form({}) });
    expect(again.body).toContain("already answered");
  });
});
