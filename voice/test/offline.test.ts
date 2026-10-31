import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ScriptedBrain, sceneLines } from "../../agent/src/scripted-brain.js";
import { JUDGE_LINES } from "../../agent/src/script.js";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { LAKSHMI_ID, RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import { CachedSpeechClient } from "../src/cached-speech.js";
import { CallSession, type CallEvent } from "../src/pipeline.js";
import { FakeSpeechClient } from "../src/speech.js";
import { splitSentences } from "../src/audio.js";

describe("CachedSpeechClient", () => {
  it("fills the cache from the inner client, then serves hits with no inner client", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "saathi-cache-"));
    const inner = new FakeSpeechClient();
    const online = new CachedSpeechClient(inner, { dir, speaker: "priya" });
    const a = await online.tts("नमस्ते रवि जी", "hi-IN");
    const b = await online.tts("नमस्ते रवि जी", "hi-IN");
    expect(inner.ttsCalls).toHaveLength(1);
    expect(b.wav.equals(a.wav)).toBe(true);
    expect(online.hits).toBe(1);
    const offline = new CachedSpeechClient(undefined, { dir, speaker: "priya" });
    expect((await offline.tts("नमस्ते रवि जी", "hi-IN")).wav.equals(a.wav)).toBe(true);
    await expect(offline.tts("कुछ और", "hi-IN")).rejects.toThrow(/offline: no cached audio/);
    await expect(offline.stt(Buffer.alloc(44), "hi-IN")).rejects.toThrow(/offline/);
    // Different speaker, different key.
    expect(new CachedSpeechClient(undefined, { dir, speaker: "amit" }).has("नमस्ते रवि जी", "hi-IN")).toBe(false);
  });
});

describe("ScriptedBrain offline scene", () => {
  async function run(merchantId: string, lines: string[]) {
    const clock = fixedClock("2026-10-31T10:15:00+05:30");
    const store = MerchantStore.seeded(clock);
    const bus = new EventBus();
    const actions: string[] = [];
    bus.subscribe((e) => {
      if (e.type === "action") actions.push(`${e.entry.actor}:${e.entry.tool}:${e.entry.ok}`);
    });
    const events: CallEvent[] = [];
    const session = new CallSession({ merchantId, store, clock, llm: new ScriptedBrain(merchantId), speech: new FakeSpeechClient(), bus, transport: "test", onEvent: (e) => events.push(e) });
    await session.prepare();
    await session.answer();
    for (const l of lines) await session.handleText(l);
    return { store, actions, events, session };
  }

  it("replays the Ravi scene with the same tool calls as the live agent", async () => {
    const { store, actions, events } = await run(RAVI_ID, JUDGE_LINES["hi-IN"]);
    expect(actions).toEqual([
      "Diagnoser:get_briefing:true", "Fixer:restart_device:true", "System:number_audit:true",
      "Compliance:compliance_check:true", "Fixer:send_reminder:true", "Seller:check_loan_eligibility:true", "System:number_audit:true",
      "Compliance:compliance_check:true", "Manager:request_human_approval:true", "Seller:offer_loan:true", "System:number_audit:true",
      "Manager:end_call:true",
    ]);
    expect(store.counters(RAVI_ID)).toEqual({ recovered: 1340, collected: 0, offered: 50000, ticketsAvoided: 1 });
    const said = events.filter((e) => e.type === "transcript" && e.speaker === "saathi").map((e) => (e as { text: string }).text);
    expect(said[0]).toMatch(/^नमस्ते रवि जी, मैं साथी बोल रही हूँ, Paytm की AI/);
    await new Promise((r) => setTimeout(r, 1200));
  });

  it("replays the Lakshmi scene in Kannada and retries the settlement", async () => {
    const { store, actions } = await run(LAKSHMI_ID, JUDGE_LINES["kn-IN"]);
    expect(actions[1]).toBe("Fixer:retry_settlement:true");
    expect(store.counters(LAKSHMI_ID)).toEqual({ recovered: 8450, collected: 0, offered: 30000, ticketsAvoided: 1 });
  });

  it("handles a no to the reminder and a no to the loan", async () => {
    const { actions, events } = await run(RAVI_ID, ["नहीं, रहने दो", "नहीं चाहिए", "ठीक है, धन्यवाद"]);
    expect(actions).not.toContain("Fixer:send_reminder:true");
    expect(actions).not.toContain("Seller:offer_loan:true");
    expect(actions.at(-1)).toBe("Manager:end_call:true");
    const said = events.filter((e) => e.type === "transcript" && e.speaker === "saathi").map((e) => (e as { text: string }).text);
    expect(said.some((t) => /कोई बात नहीं/.test(t))).toBe(true);
  });

  it("every scripted line splits into the same chunks the pipeline will request", () => {
    for (const id of [RAVI_ID, LAKSHMI_ID]) for (const line of sceneLines(id)) expect(splitSentences(line).join(" ")).toBe(line.replace(/\s+/g, " ").trim());
  });
});
