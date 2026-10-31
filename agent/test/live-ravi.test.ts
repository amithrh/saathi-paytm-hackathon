/**
 * Live test against Sarvam. Runs only with LIVE=1 (npm run test:live).
 * Checks the demo conversation end to end as text: tool order, compliance before actions, language.
 */
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { LAKSHMI_ID, RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import { SaathiAgent } from "../src/agent.js";
import { sarvamApiKey, sarvamChatFromEnv } from "../src/env.js";
import { JUDGE_LINES } from "../src/script.js";

const key = sarvamApiKey();
const run = key ? describe : describe.skip;

async function runConversation(merchantId: string) {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const actions: Array<{ actor: string; tool: string }> = [];
  bus.subscribe((e) => {
    if (e.type === "action") actions.push({ actor: e.entry.actor, tool: e.entry.tool });
  });
  const agent = new SaathiAgent({ llm: sarvamChatFromEnv(), store, clock, merchantId, callId: "live", bus });
  const lang = store.get(merchantId).language;
  const turns = [await agent.prepare(), await agent.open()];
  for (const line of JUDGE_LINES[lang]) {
    turns.push(await agent.respond(line));
    if (agent.hasEnded) break;
  }
  const calls = turns.flatMap((t) => t.toolCalls).map((c) => c.tool);
  return { store, agent, turns, calls, lang, actions };
}

run("live Ravi conversation (Hindi)", () => {
  it("runs the whole demo flow with compliance before each gated action", async () => {
    const { store, agent, turns, calls, actions } = await runConversation(RAVI_ID);
    expect(calls[0]).toBe("get_briefing");
    expect(calls).toContain("restart_device");
    expect(calls.indexOf("compliance_check")).toBeLessThan(calls.indexOf("send_reminder"));
    expect(calls.lastIndexOf("compliance_check")).toBeLessThan(calls.indexOf("offer_loan"));
    expect(calls).toContain("check_loan_eligibility");
    expect(actions).toContainEqual({ actor: "Manager", tool: "request_human_approval" });
    expect(new Set(actions.map((a) => a.actor))).toEqual(new Set(["Diagnoser", "Fixer", "Compliance", "Seller", "Manager"]));
    expect(agent.hasEnded).toBe(true);
    const opening = turns[1]!.speech;
    expect(opening).toMatch(/14200/);
    expect(opening).toMatch(/[ऀ-ॿ]/);
    expect(opening).toMatch(/2300/);
    expect(store.counters(RAVI_ID)).toEqual({ recovered: 1340, collected: 0, offered: 50000, ticketsAvoided: 1 });
    expect(store.get(RAVI_ID).loanOffers[0]!.status).toBe("awaiting_human_approval");
    // Every rupee figure Saathi spoke must come from a tool result (no model arithmetic).
    for (const t of turns) expect(t.numberAudit.unbacked).toEqual([]);
    expect(turns[1]!.numberAudit.spoken).toEqual(expect.arrayContaining([14200, 1340, 2300]));
    const maxLlm = Math.max(...turns.map((t) => t.llmMs));
    console.log(`Ravi live: LLM ms per turn ${turns.map((t) => t.llmMs).join(", ")}; max ${maxLlm}`);
    expect(maxLlm).toBeLessThan(15000);
  }, 90_000);
});

run("live Lakshmi conversation (Kannada)", () => {
  it("speaks Kannada and retries the failed settlement", async () => {
    const { store, turns, calls } = await runConversation(LAKSHMI_ID);
    expect(calls).toContain("retry_settlement");
    expect(turns[1]!.speech).toMatch(/[ಀ-೿]/);
    expect(turns[1]!.speech).toMatch(/11650/);
    expect(calls.indexOf("compliance_check")).toBeLessThan(calls.indexOf("send_reminder"));
    expect(store.counters(LAKSHMI_ID).recovered).toBe(8450);
    for (const t of turns) expect(t.numberAudit.unbacked).toEqual([]);
  }, 90_000);
});
