import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { ChatClient, ChatResult } from "../../agent/src/llm.js";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import { CallSession, type CallEvent } from "../../voice/src/pipeline.js";
import { FakeSpeechClient } from "../../voice/src/speech.js";
import { placeCall } from "../src/rest.js";
import { registerTwilioRoutes } from "../src/routes.js";

/** A brain that only ever says one line and never calls tools. */
const quietBrain: ChatClient = { complete: async (): Promise<ChatResult> => ({ content: "नमस्ते रवि जी।", toolCalls: [], ms: 1 }) };

describe("placeCall", () => {
  it("posts a form to the Calls endpoint with basic auth", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init! };
      return new Response(JSON.stringify({ sid: "CA123", status: "queued" }), { status: 201 });
    }) as typeof fetch;
    const r = await placeCall({ accountSid: "ACxx", authToken: "tok", fromNumber: "+15550001" }, { to: "+919900000000", voiceUrl: "https://x.ngrok.app/twilio/voice?token=t1" }, fakeFetch);
    expect(r).toEqual({ callSid: "CA123", status: "queued" });
    expect(seen!.url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACxx/Calls.json");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("ACxx:tok").toString("base64")}`);
    const body = seen!.init.body as URLSearchParams;
    expect(body.get("To")).toBe("+919900000000");
    expect(body.get("Url")).toContain("token=t1");
  });
  it("surfaces Twilio errors", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ message: "Unverified number", code: 21219 }), { status: 400 })) as typeof fetch;
    await expect(placeCall({ accountSid: "AC", authToken: "t", fromNumber: "+1" }, { to: "+91", voiceUrl: "https://x" }, fakeFetch)).rejects.toThrow(/Unverified number \(code 21219\)/);
  });
});

describe("twilio routes", () => {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const sessions: CallSession[] = [];
  const makeSession = (merchantId: string, onEvent: (e: CallEvent) => void) => {
    const s = new CallSession({ merchantId, store, clock, llm: quietBrain, speech: new FakeSpeechClient(), bus, transport: "twilio", onEvent });
    sessions.push(s);
    return s;
  };
  const dials: string[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    dials.push(String((init!.body as URLSearchParams).get("Url")));
    return new Response(JSON.stringify({ sid: "CA777", status: "queued" }), { status: 201 });
  }) as typeof fetch;

  const unconfigured = Fastify();
  const configured = Fastify();
  let port = 0;
  beforeAll(async () => {
    await unconfigured.register(fastifyWebsocket);
    await registerTwilioRoutes(unconfigured, { makeSession, env: {} });
    await unconfigured.ready();
    await configured.register(fastifyWebsocket);
    await registerTwilioRoutes(configured, { makeSession, env: { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM_NUMBER: "+15550001", DEMO_PHONE_NUMBER: "+919900000000" }, publicBaseUrl: "https://demo.ngrok.app", fetchImpl: fakeFetch });
    await configured.listen({ port: 0, host: "127.0.0.1" });
    port = (configured.server.address() as { port: number }).port;
  });
  afterAll(async () => {
    await unconfigured.close();
    await configured.close();
  });

  it("reports unconfigured and refuses to dial without credentials", async () => {
    expect((await unconfigured.inject({ method: "GET", url: "/twilio/status" })).json()).toMatchObject({ configured: false });
    const r = await unconfigured.inject({ method: "POST", url: "/twilio/call", payload: {} });
    expect(r.statusCode).toBe(503);
    expect(r.json().error).toMatch(/credentials/);
  });

  it("prepares the session, dials, serves TwiML and attaches the media stream by token", async () => {
    const r = await configured.inject({ method: "POST", url: "/twilio/call", payload: { merchantId: RAVI_ID } });
    expect(r.statusCode).toBe(200);
    const { token, callSid } = r.json() as { token: string; callSid: string };
    expect(callSid).toBe("CA777");
    expect(dials[0]).toBe(`https://demo.ngrok.app/twilio/voice?token=${token}`);
    expect(sessions.at(-1)!.currentState).toBe("ringing"); // prepared before the phone rings

    const twiml = await configured.inject({ method: "POST", url: `/twilio/voice?token=${token}` });
    expect(twiml.headers["content-type"]).toMatch(/xml/);
    expect(twiml.body).toContain('url="wss://demo.ngrok.app/twilio/media"');
    expect(twiml.body).toContain(`value="${token}"`);

    const ws = new WebSocket(`ws://127.0.0.1:${port}/twilio/media`);
    const received: Array<Record<string, unknown>> = [];
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => {
        ws.send(JSON.stringify({ event: "connected", protocol: "Call", version: "1.0.0" }));
        ws.send(JSON.stringify({ event: "start", streamSid: "MZ9", start: { streamSid: "MZ9", callSid: "CA777", accountSid: "AC1", customParameters: { token }, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } }));
      });
      ws.on("message", (d) => {
        received.push(JSON.parse(d.toString()));
        if (received.some((m) => m.event === "mark")) resolve();
      });
      ws.on("error", reject);
      setTimeout(() => reject(new Error("no media received")), 5000);
    });
    expect(sessions.at(-1)!.currentState).toBe("live");
    expect(received.filter((m) => m.event === "media").length).toBeGreaterThan(5);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    expect(sessions.at(-1)!.currentState).toBe("ended");
  });

  it("serves TwiML for an inbound call without a token by preparing a fresh session", async () => {
    const before = sessions.length;
    const twiml = await configured.inject({ method: "POST", url: "/twilio/voice" });
    expect(twiml.statusCode).toBe(200);
    expect(twiml.body).toContain("<Connect><Stream");
    expect(sessions.length).toBe(before + 1);
  });
});
