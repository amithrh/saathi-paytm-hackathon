import { describe, expect, it } from "vitest";
import { fixedClock } from "../src/clock.js";
import { BANDS, cashNeed, CREDIT_WEIGHTS, creditSignal } from "../src/credit.js";
import { FLEET_IDS, LAKSHMI_ID, NOT_YET_ID, RAVI_ID } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";
import { runToolByName } from "../src/tools.js";

const clock = fixedClock("2026-10-31T10:15:00+05:30");

describe("creditSignal", () => {
  const store = MerchantStore.seeded(clock);

  it("has five weighted components that sum to the score", () => {
    const c = creditSignal(store.get(RAVI_ID), clock.now());
    expect(c.components.map((x) => x.key)).toEqual(["settlement_regularity", "takings_trend", "udhaar_recovery", "device_uptime", "repayment_history"]);
    expect(Object.values(CREDIT_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    const weighted = Math.round(c.components.reduce((s, x) => s + x.score * x.weight, 0));
    expect(c.score).toBe(weighted);
    for (const x of c.components) {
      expect(x.score).toBeGreaterThanOrEqual(0);
      expect(x.score).toBeLessThanOrEqual(100);
      expect(x.value.length).toBeGreaterThan(5);
    }
    expect(c.note).toMatch(/model never computes/);
  });

  it("puts Ravi and Lakshmi in eligible with the demo limits, and m006 in not yet", () => {
    const r = creditSignal(store.get(RAVI_ID), clock.now());
    expect(r).toMatchObject({ band: "eligible", limit: 50000 });
    expect(r.components.find((x) => x.key === "takings_trend")!.score).toBe(100);
    expect(creditSignal(store.get(LAKSHMI_ID), clock.now())).toMatchObject({ band: "eligible", limit: 30000 });
    expect(creditSignal(store.get(NOT_YET_ID), clock.now())).toMatchObject({ band: "not yet", limit: 0 });
  });

  it("is deterministic and the fleet shows a spread of bands", () => {
    const again = MerchantStore.seeded(clock);
    const bands = FLEET_IDS.map((id) => creditSignal(store.get(id), clock.now()));
    expect(FLEET_IDS.map((id) => creditSignal(again.get(id), clock.now()).score)).toEqual(bands.map((b) => b.score));
    expect(new Set(bands.map((b) => b.band))).toEqual(new Set(["strong", "eligible", "not yet"]));
    expect(BANDS.map((b) => b.band)).toEqual(["strong", "eligible", "watch", "not yet"]);
  });

  it("names the cash-need triggers: Diwali stock-up for Ravi, stuck settlement plus Deepavali for Lakshmi", () => {
    expect(cashNeed(store.get(RAVI_ID), clock.now()).triggers.map((t) => t.kind)).toEqual(["seasonal_stock_up"]);
    expect(cashNeed(store.get(LAKSHMI_ID), clock.now()).triggers.map((t) => t.kind)).toEqual(["seasonal_stock_up", "stuck_settlement"]);
    expect(cashNeed(store.get("m005"), clock.now()).active).toBe(false);
  });
});

describe("check_loan_eligibility uses the credit signal and needs a cash-need trigger", () => {
  const store = MerchantStore.seeded(clock);
  const run = async (merchantId: string) => (await runToolByName("check_loan_eligibility", {}, { store, clock, merchantId })).result as Record<string, unknown>;

  it("offers Ravi 50,000 with the band and components", async () => {
    const r = await run(RAVI_ID);
    expect(r).toMatchObject({ eligible: true, max_amount: 50000, credit_band: "eligible" });
    expect((r.credit_components as unknown[]).length).toBe(5);
  });
  it("refuses the not-yet merchant and says why", async () => {
    const r = await run(NOT_YET_ID);
    expect(r).toMatchObject({ eligible: false, max_amount: 0, credit_band: "not yet" });
    expect(r.not_offered_because).toMatch(/not yet/);
  });
  it("refuses a well-scored merchant with no cash-need trigger", async () => {
    const r = await run("m005");
    expect(["eligible", "strong"]).toContain(r.credit_band);
    expect(r).toMatchObject({ eligible: false });
    expect(r.not_offered_because).toMatch(/No active cash-need trigger/);
  });
  it("offer_loan follows: the not-yet merchant cannot be offered even with a compliance ticket", async () => {
    const ctx = { store, clock, merchantId: NOT_YET_ID };
    await runToolByName("compliance_check", { action: "offer_loan", merchant_consented: true, amount: 10000 }, ctx);
    const o = await runToolByName("offer_loan", { amount: 10000, merchant_consented: true }, ctx);
    expect(o.result).toMatchObject({ error: "NOT_ELIGIBLE" });
  });
});
