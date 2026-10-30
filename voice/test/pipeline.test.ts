import { describe, expect, it } from "vitest";
import type { ChatClient, ChatMessage, ChatResult } from "../../agent/src/llm.js";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import type { ServerEvent } from "../../shared/types.js";
import { tone } from "../src/audio.js";
import { CallSession, type CallEvent } from "../src/pipeline.js";
import { FakeSpeechClient } from "../src/speech.js";

/** Minimal scripted agent brain: briefing+restart on pre-call, greeting, reminder flow, goodbye. */
class ScriptedBrain implements ChatClient {
  private n = 0;
  async complete(messages: ChatMessage[]): Promise<ChatResult> {
    const last = messages[messages.length - 1]!;
    const user = [...messages].reverse().find((m) => m.role === "user") as { content: string };
    this.n++;
    const tc = (name: string, args: Record<string, unknown>) => ({ id: `t${this.n}`, name, args, rawArguments: JSON.stringify(args) });
    if (user.content === "[PRE-CALL]") {
      if (last.role === "user") return { content: null, toolCalls: [tc("get_briefing", {})], ms: 1 };
      if (last.role === "tool" && last.name === "get_briefing") return { content: null, toolCalls: [tc("restart_device", { device_id: "SB-7F42" })], ms: 1 };
      return { content: "READY", toolCalls: [], ms: 1 };
    }
    if (user.content === "[CALL CONNECTED]") return { content: "नमस्ते रवि जी। कल 14200 रुपये आए। सुरेश जी का 2300 रुपये बाकी है। रिमाइंडर भेज दूँ?", toolCalls: [], ms: 1 };
    if (/रिमाइंडर/.test(user.content)) {
      if (last.role === "user") return { content: null, toolCalls: [tc("compliance_check", { action: "send_reminder", customer_id: "c-suresh" })], ms: 1 };
      if (last.role === "tool" && last.name === "compliance_check") return { content: null, toolCalls: [tc("send_reminder", { customer_id: "c-suresh" })], ms: 1 };
      return { content: "भेज दिया।", toolCalls: [], ms: 1 };
    }
    if (last.role === "user") return { content: null, toolCalls: [tc("end_call", { reason: "done" })], ms: 1 };
    return { content: "नमस्ते।", toolCalls: [], ms: 1 };
  }
}

function setup(transcripts: string[]) {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const busEvents: ServerEvent[] = [];
  bus.subscribe((e) => busEvents.push(e));
  const events: CallEvent[] = [];
  const speech = new FakeSpeechClient(transcripts);
  const session = new CallSession({ merchantId: RAVI_ID, store, clock, llm: new ScriptedBrain(), speech, bus, transport: "test", onEvent: (e) => events.push(e) });
  return { session, events, busEvents, store, speech };
}

describe("CallSession", () => {
  it("prepares during ringing, plays the opening on answer, then runs a voice turn", async () => {
    const { session, events, busEvents, store, speech } = setup(["हाँ, सुरेश को रिमाइंडर भेजो।", "ठीक है, धन्यवाद।"]);
    await session.prepare();
    expect(session.currentState).toBe("ringing");
    expect(store.get(RAVI_ID).devices[0]!.status).toBe("online"); // fixed before the merchant answered
    expect(events.filter((e) => e.type === "audio")).toHaveLength(0); // nothing played yet
    expect(speech.ttsCalls.length).toBeGreaterThanOrEqual(2); // opening was split into sentences

    await session.answer();
    expect(session.currentState).toBe("live");
    const opening = events.filter((e) => e.type === "audio");
    expect(opening.length).toBe(speech.ttsCalls.length);
    expect(opening.map((e) => (e as { chunk: number }).chunk)).toEqual(opening.map((_, i) => i));

    await session.handleUtterance(tone(200, 1, 16000));
    expect(speech.sttCalls[0]!.lang).toBe("hi-IN");
    const transcript = events.filter((e) => e.type === "transcript") as Array<{ speaker: string; text: string }>;
    expect(transcript.map((t) => t.speaker)).toEqual(["saathi", "merchant", "saathi"]);
    expect(transcript[1]!.text).toContain("सुरेश");
    expect(store.get(RAVI_ID).udhaar.find((u) => u.customerId === "c-suresh")!.status).toBe("reminded");
    const latency = events.filter((e) => e.type === "latency") as Array<{ latency: { turn: number; totalMs: number } }>;
    expect(latency.map((l) => l.latency.turn)).toEqual([0, 1]);
    expect(busEvents.some((e) => e.type === "whatsapp")).toBe(true);
    expect(busEvents.filter((e) => e.type === "call").map((e) => (e as { state: string }).state)).toEqual(["preparing", "ringing", "live"]);

    await session.handleUtterance(tone(200, 1, 16000));
    const thinking = events.filter((e) => e.type === "thinking") as Array<{ on: boolean }>;
    expect(thinking.at(-1)!.on).toBe(false);
    await new Promise((r) => setTimeout(r, 1500));
    expect(session.currentState).toBe("ended");
  });

  it("typed text skips STT and ignores input before answer", async () => {
    const { session, events, speech } = setup([]);
    await session.prepare();
    await session.handleText("hello");
    expect(events.filter((e) => e.type === "transcript")).toHaveLength(0);
    await session.answer();
    await session.handleText("हाँ, सुरेश को रिमाइंडर भेजो।");
    expect(speech.sttCalls).toHaveLength(0);
    const l = (events.filter((e) => e.type === "latency").at(-1) as { latency: { sttMs: number; turn: number } }).latency;
    expect(l.sttMs).toBe(0);
    expect(l.turn).toBe(1);
  });

  it("keeps going when a TTS chunk fails", async () => {
    const { session, events, speech } = setup([]);
    let calls = 0;
    const realTts = speech.tts.bind(speech);
    speech.tts = async (text, lang) => {
      calls++;
      if (calls === 2) throw new Error("boom");
      return realTts(text, lang);
    };
    await session.prepare();
    await session.answer();
    expect(events.some((e) => e.type === "error" && /TTS failed/.test(e.message))).toBe(true);
    expect(events.filter((e) => e.type === "audio").length).toBeGreaterThanOrEqual(2);
  });
});
