import { describe, expect, it } from "vitest";
import { evaluateCompliance } from "../src/compliance.js";
import { fixedClock } from "../src/clock.js";
import { MerchantStore } from "../src/store.js";
import { RAVI_ID } from "../src/seed.js";

const DAY = fixedClock("2026-10-31T10:15:00+05:30");
const NIGHT = fixedClock("2026-10-31T22:30:00+05:30");
const EVENING = fixedClock("2026-10-31T19:05:00+05:30");
const EARLY = fixedClock("2026-10-31T08:59:00+05:30");
const KFS = { amount: 50000, annualRatePct: 18, tenureMonths: 6, monthlyRepayment: 9080, totalRepayment: 54480, processingFee: 0 };

describe("compliance rules", () => {
  const store = MerchantStore.seeded(DAY);
  const ravi = store.get(RAVI_ID);

  it("allows a reminder in calling hours with consent", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "send_reminder", now: DAY.now(), customerId: "c-suresh" });
    expect(r.allowed).toBe(true);
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.checks.map((c) => c.rule)).toContain("Calling window");
    expect(r.gates.map((g) => g.key)).toEqual(["ai_disclosed", "calling_window", "merchant_consent", "ledger_line", "frequency_cap", "template", "p2m"]);
    expect(r.gates.every((g) => g.status === "pass")).toBe(true);
  });

  it("refuses outside the 9 AM to 7 PM window (TRAI TCCCPR 2025)", () => {
    for (const clock of [NIGHT, EVENING, EARLY]) {
      const r = evaluateCompliance({ merchant: ravi, action: "send_reminder", now: clock.now(), customerId: "c-suresh" });
      expect(r.allowed).toBe(false);
      expect(r.refusalReason).toMatch(/Calling window/);
      expect(r.gates.find((g) => g.key === "calling_window")!.status).toBe("fail");
    }
  });

  it("refuses a reminder when the merchant has not allowed udhaar reminders", () => {
    const m = store.get("m009");
    expect(m.consent.udhaarReminders).toBe(false);
    const r = evaluateCompliance({ merchant: m, action: "send_reminder", now: DAY.now(), customerId: m.udhaar[0]!.customerId });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/Udhaar-reminder consent/);
  });

  it("refuses a reminder for an unknown customer", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "send_reminder", now: DAY.now(), customerId: "c-nobody" });
    expect(r.allowed).toBe(false);
  });

  it("refuses a loan offer without the merchant's explicit consent (RBI Digital Lending Directions)", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "offer_loan", now: DAY.now(), kfs: KFS });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/Explicit consent/);
    const ok = evaluateCompliance({ merchant: ravi, action: "offer_loan", now: DAY.now(), merchantConsented: true, kfs: KFS });
    expect(ok.allowed).toBe(true);
    expect(ok.checks.map((c) => c.ref)).toContain("RBI Digital Lending Directions 2025");
  });

  it("refuses a loan offer when no Key Fact Statement figures were supplied", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "offer_loan", now: DAY.now(), merchantConsented: true });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/Key Fact Statement/);
  });

  it("shapes the loan gates for the dashboard panel in order, with the KFS figures and the consent time", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "offer_loan", now: DAY.now(), merchantConsented: true, kfs: KFS });
    expect(r.gates.map((g) => [g.key, g.status])).toEqual([
      ["ai_disclosed", "pass"], ["calling_window", "pass"], ["promo_consent", "pass"], ["lender", "pass"], ["kfs", "pass"], ["consent", "pass"], ["cooling_off", "pass"], ["human_approval", "pending"],
    ]);
    expect(r.gates.find((g) => g.key === "kfs")!.detail).toBe("₹50,000, 18% APR, 6 months, EMI ≈ ₹9,080");
    expect(r.gates.find((g) => g.key === "consent")!.label).toBe("Consent logged 10:15");
    expect(r.gates.find((g) => g.key === "cooling_off")!.label).toBe("Cooling-off 1 day");
  });

  it("refuses a loan offer without promotional consent", () => {
    const m = store.get("m007");
    expect(m.consent.promotionalCalls).toBe(false);
    const r = evaluateCompliance({ merchant: m, action: "offer_loan", now: DAY.now(), merchantConsented: true, kfs: KFS });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/Promotional consent/);
  });

  it("refuses a loan offer to a DND merchant without explicit opt-in", () => {
    const m = structuredClone(store.get("m011"));
    expect(m.dndRegistered).toBe(true);
    m.consent.promotionalCalls = false;
    const r = evaluateCompliance({ merchant: m, action: "offer_loan", now: DAY.now(), merchantConsented: true, kfs: KFS });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/DND/);
  });
});
