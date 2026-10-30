import { describe, expect, it } from "vitest";
import { buildMerchants, LAKSHMI_ID, RAVI_ID } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";
import { fixedClock } from "../src/clock.js";

const TODAY = "2026-10-31";
const CLOCK = fixedClock("2026-10-31T10:15:00+05:30");

describe("seeded merchant data", () => {
  it("is deterministic for the same day", () => {
    const a = buildMerchants(TODAY);
    const b = buildMerchants(TODAY);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("has twenty merchants with both languages", () => {
    const ms = buildMerchants(TODAY);
    expect(ms).toHaveLength(20);
    expect(new Set(ms.map((m) => m.id)).size).toBe(20);
    expect(ms.some((m) => m.language === "hi-IN")).toBe(true);
    expect(ms.some((m) => m.language === "kn-IN")).toBe(true);
    for (const m of ms) {
      expect(m.transactions.length).toBeGreaterThan(200);
      expect(m.settlements).toHaveLength(7);
      expect(m.udhaar.length).toBeGreaterThan(0);
      expect(m.seasonalLastYear).toHaveLength(12);
    }
  });

  it("plants Ravi's demo facts", () => {
    const store = MerchantStore.seeded(CLOCK);
    const ravi = store.get(RAVI_ID);
    expect(ravi.language).toBe("hi-IN");
    expect(ravi.area).toContain("Jayanagar");
    expect(store.takings(RAVI_ID).yesterday).toBe(14200);
    const sb = ravi.devices.find((d) => d.type === "soundbox")!;
    expect(sb.status).toBe("offline");
    expect(sb.events[0]!.unconfirmed).toEqual({ count: 7, amount: 1340 });
    expect(sb.events[0]!.at).toBe("2026-10-30T12:32:00.000Z"); // 18:02 IST
    const suresh = ravi.udhaar.find((u) => u.customerName === "Suresh")!;
    expect(suresh.amount).toBe(2300);
    expect(suresh.since).toBe("2026-10-19"); // 12 days
    const oct = ravi.seasonalLastYear.find((m) => m.month === "2025-10")!.total;
    const avg = ravi.seasonalLastYear.reduce((s, m) => s + m.total, 0) / 12;
    expect(oct / avg).toBeGreaterThan(1.2);
  });

  it("plants Lakshmi's demo facts in Kannada", () => {
    const store = MerchantStore.seeded(CLOCK);
    const l = store.get(LAKSHMI_ID);
    expect(l.language).toBe("kn-IN");
    expect(store.takings(LAKSHMI_ID).yesterday).toBe(11650);
    const failed = l.settlements.filter((s) => s.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.amount).toBe(8450);
    expect(l.udhaar.find((u) => u.customerName === "Manjunath")!.amount).toBe(1800);
  });

  it("today's takings only count transactions up to now", () => {
    const early = MerchantStore.seeded(fixedClock("2026-10-31T08:00:00+05:30"));
    const late = MerchantStore.seeded(fixedClock("2026-10-31T21:30:00+05:30"));
    expect(early.takings(RAVI_ID).today).toBeLessThan(late.takings(RAVI_ID).today);
    expect(early.takings(RAVI_ID).yesterday).toBe(late.takings(RAVI_ID).yesterday);
  });
});
