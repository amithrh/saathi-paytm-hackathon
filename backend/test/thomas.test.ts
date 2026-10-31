import { describe, expect, it } from "vitest";
import { ScriptedBrain } from "../../agent/src/scripted-brain.js";
import { JUDGE_LINES } from "../../agent/src/script.js";
import { systemPrompt } from "../../agent/src/prompt.js";
import { playThenGatherTwiml, REPROMPT, SPEECH_HINTS } from "../../twilio/src/turns.js";
import { CallSession } from "../../voice/src/pipeline.js";
import { FakeSpeechClient } from "../../voice/src/speech.js";
import { bringSoundboxDown } from "../src/bringdown.js";
import { fixedClock } from "../src/clock.js";
import { EventBus } from "../src/events.js";
import { FleetMonitor } from "../src/fleet.js";
import { THOMAS_ID } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";
import { runToolByName } from "../src/tools.js";

const clock = fixedClock("2026-10-31T10:15:00+05:30");

describe("English demo merchant (m003 Thomas)", () => {
  it("is seeded as an English-speaking Koramangala cafe with calm devices and an 11-day udhaar", () => {
    const store = MerchantStore.seeded(clock);
    const m = store.get(THOMAS_ID);
    expect(m).toMatchObject({ ownerName: "Thomas Mathew", category: "Cafe", language: "en-IN" });
    expect(m.area).toContain("Koramangala");
    expect(store.takings(THOMAS_ID).yesterday).toBe(9800);
    expect(m.devices.every((d) => d.status === "online")).toBe(true);
    expect(m.udhaar[0]).toMatchObject({ customerName: "Arjun", amount: 1600, since: "2026-10-20" });
  });

  it("gets an English prompt, an English reminder and an English Gather", async () => {
    const store = MerchantStore.seeded(clock);
    expect(systemPrompt(store.get(THOMAS_ID))).toMatch(/Speak ONLY in simple, warm Indian English/);
    const ctx = { store, clock, merchantId: THOMAS_ID };
    await runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-arjun" }, ctx);
    const r = (await runToolByName("send_reminder", { customer_id: "c-arjun" }, ctx)).result as { message: string };
    expect(r.message).toMatch(/^Hello Arjun, a gentle reminder from Thomas Bean & Bake Cafe/);
    expect(r.message).toContain("upi://pay?pa=ptm-kor-00303@paytm");
    const xml = playThenGatherTwiml({ audioUrls: [], actionUrl: "https://x/g", language: "en-IN", hints: SPEECH_HINTS["en-IN"] });
    expect(xml).toContain('language="en-IN"');
    expect(xml).toContain("Arjun");
    expect(REPROMPT["en-IN"]).toBe("Yes, please go ahead.");
  });

  it("replays the scripted English scene with the same tools: reminder, loan, goodbye", async () => {
    const store = MerchantStore.seeded(clock);
    const bus = new EventBus();
    const tools: string[] = [];
    bus.subscribe((e) => {
      if (e.type === "action" && e.entry.actor !== "System") tools.push(e.entry.tool);
    });
    const session = new CallSession({ merchantId: THOMAS_ID, store, clock, llm: new ScriptedBrain(THOMAS_ID), speech: new FakeSpeechClient(), bus, transport: "test", onEvent: () => undefined });
    await session.prepare();
    await session.answer();
    for (const l of JUDGE_LINES["en-IN"]) await session.handleText(l);
    expect(tools).toEqual(["get_briefing", "compliance_check", "send_reminder", "check_loan_eligibility", "compliance_check", "request_human_approval", "offer_loan", "end_call"]);
    expect(store.get(THOMAS_ID).loanOffers[0]).toMatchObject({ amount: 60000, status: "awaiting_human_approval" });
  });

  it("bring-down escalates Thomas to a call (Arjun is 11 days)", async () => {
    const store = MerchantStore.seeded(clock);
    const bus = new EventBus();
    const monitor = new FleetMonitor(store, clock, bus);
    const dialled: string[] = [];
    const out = await bringSoundboxDown({ store, clock, bus, monitor, merchantId: THOMAS_ID, sleep: async () => undefined, dial: async (id) => { dialled.push(id); return { ok: true, callSid: "CA", status: "queued" }; } });
    expect(out.escalated).toBe(true);
    expect(dialled).toEqual([THOMAS_ID]);
  });
});
