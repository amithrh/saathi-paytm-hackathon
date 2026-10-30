import { describe, expect, it } from "vitest";
import { evaluateCompliance } from "../src/compliance.js";
import { fixedClock } from "../src/clock.js";
import { MerchantStore } from "../src/store.js";
import { RAVI_ID } from "../src/seed.js";

const DAY = fixedClock("2026-10-31T10:15:00+05:30");
const NIGHT = fixedClock("2026-10-31T22:30:00+05:30");
const EARLY = fixedClock("2026-10-31T08:59:00+05:30");

describe("compliance rules", () => {
  const store = MerchantStore.seeded(DAY);
  const ravi = store.get(RAVI_ID);

  it("allows a reminder in calling hours with consent", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "send_reminder", now: DAY.now(), customerId: "c-suresh" });
    expect(r.allowed).toBe(true);
    expect(r.checks.every((c) => c.passed)).toBe(true);
    expect(r.checks.map((c) => c.rule)).toContain("Calling hours");
  });

  it("refuses outside calling hours (TRAI quiet hours)", () => {
    for (const clock of [NIGHT, EARLY]) {
      const r = evaluateCompliance({ merchant: ravi, action: "send_reminder", now: clock.now(), customerId: "c-suresh" });
      expect(r.allowed).toBe(false);
      expect(r.refusalReason).toMatch(/Calling hours/);
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

  it("refuses a loan offer without the merchant's explicit consent (RBI DLG)", () => {
    const r = evaluateCompliance({ merchant: ravi, action: "offer_loan", now: DAY.now() });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/Explicit consent/);
    const ok = evaluateCompliance({ merchant: ravi, action: "offer_loan", now: DAY.now(), merchantConsented: true });
    expect(ok.allowed).toBe(true);
    expect(ok.checks.map((c) => c.ref)).toContain("RBI Digital Lending Guidelines 2022");
  });

  it("refuses a loan offer without promotional consent", () => {
    const m = store.get("m007");
    expect(m.consent.promotionalCalls).toBe(false);
    const r = evaluateCompliance({ merchant: m, action: "offer_loan", now: DAY.now(), merchantConsented: true });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/Promotional consent/);
  });

  it("refuses a loan offer to a DND merchant without explicit opt-in", () => {
    const m = structuredClone(store.get("m011"));
    expect(m.dndRegistered).toBe(true);
    m.consent.promotionalCalls = false;
    const r = evaluateCompliance({ merchant: m, action: "offer_loan", now: DAY.now(), merchantConsented: true });
    expect(r.allowed).toBe(false);
    expect(r.refusalReason).toMatch(/DND/);
  });
});
