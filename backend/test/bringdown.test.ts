import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../shared/types.js";
import { BRING_DOWN_TIMINGS, bringSoundboxDown, shouldEscalate, type Dialer } from "../src/bringdown.js";
import { fixedClock } from "../src/clock.js";
import { EventBus } from "../src/events.js";
import { FleetMonitor } from "../src/fleet.js";
import { LAKSHMI_ID, RAVI_ID } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";

function setup() {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const monitor = new FleetMonitor(store, clock, bus);
  const dials: Array<{ merchantId: string; to?: string }> = [];
  const okDial: Dialer = async (merchantId, to) => {
    dials.push({ merchantId, ...(to ? { to } : {}) });
    return { ok: true, callSid: "CA-fake", status: "queued" };
  };
  return { clock, store, bus, events, monitor, dials, okDial };
}
const noSleep = async () => undefined;
const sumPayments = BRING_DOWN_TIMINGS.payments.reduce((a, b) => a + b, 0);

describe("shouldEscalate", () => {
  it("needs both unannounced money and an udhaar line of 10 days or more", () => {
    expect(shouldEscalate({ unannouncedAmount: 1690, oldestUdhaarDays: 12 })).toBe(true);
    expect(shouldEscalate({ unannouncedAmount: 1690, oldestUdhaarDays: 9 })).toBe(false);
    expect(shouldEscalate({ unannouncedAmount: 0, oldestUdhaarDays: 30 })).toBe(false);
  });
});

describe("bring Soundbox down", () => {
  it("Ravi (Hindi): payments land unannounced, Diagnoser then Fixer, Manager auto-dials, tile amber then green after the call", async () => {
    const { clock, store, bus, events, monitor, dials, okDial } = setup();
    const before = store.counters(RAVI_ID).recovered;
    const out = await bringSoundboxDown({ store, clock, bus, monitor, merchantId: RAVI_ID, dial: okDial, to: "+919900000000", sleep: noSleep });
    // Ravi's overnight 7 payments (₹1,340) plus the 8 that landed during the demo.
    expect(out.unannounced).toEqual({ count: 7 + 8, amount: 1340 + sumPayments });
    expect(out.escalated).toBe(true);
    expect(dials).toEqual([{ merchantId: RAVI_ID, to: "+919900000000" }]);
    expect(store.counters(RAVI_ID).recovered - before).toBe(1340 + sumPayments);
    expect(store.get(RAVI_ID).devices[0]!.status).toBe("online");
    const actors = events.filter((e) => e.type === "action").map((e) => `${(e as { entry: { actor: string } }).entry.actor}:${(e as { entry: { tool: string } }).entry.tool}`);
    expect(actors).toEqual(["Diagnoser:trigger_fired", "Diagnoser:get_briefing", "Fixer:restart_device", "Compliance:compliance_note", "Manager:escalate_to_call", "Manager:dial"]);
    const tileTexts = events.filter((e) => e.type === "fleet" && e.merchantId === RAVI_ID).map((e) => (e as { status: string }).status);
    expect(tileTexts[0]).toBe("red");
    expect(tileTexts.at(-1)).toBe("amber");
    expect(monitor.tile(RAVI_ID).text).toMatch(/calling Ravi/);
    bus.publish({ type: "call", merchantId: RAVI_ID, callId: "c", state: "live", transport: "phone" });
    bus.publish({ type: "call", merchantId: RAVI_ID, callId: "c", state: "ended", transport: "phone" });
    expect(monitor.tile(RAVI_ID).status).toBe("green");
  });

  it("Lakshmi (Kannada) escalates too: Manjunath's udhaar is 15 days old", async () => {
    const { clock, store, bus, monitor, dials, okDial } = setup();
    const out = await bringSoundboxDown({ store, clock, bus, monitor, merchantId: LAKSHMI_ID, dial: okDial, sleep: noSleep });
    expect(out.unannounced).toEqual({ count: 8, amount: sumPayments });
    expect(dials.map((d) => d.merchantId)).toEqual([LAKSHMI_ID]);
  });

  it("shows the Twilio error and a call-screen fallback on the tile when the dial is refused", async () => {
    const { clock, store, bus, monitor } = setup();
    const out = await bringSoundboxDown({ store, clock, bus, monitor, merchantId: RAVI_ID, dial: async () => ({ ok: false, error: "Twilio 400: invalid To" }), sleep: noSleep });
    expect(out.dial).toEqual({ ok: false, error: "Twilio 400: invalid To" });
    const t = monitor.tile(RAVI_ID);
    expect(t).toMatchObject({ status: "amber", fallbackUrl: "/call?merchant=m001" });
    expect(t.text).toMatch(/Call failed: Twilio 400/);
  });

  it("fixes without a call when there is no ageing udhaar", async () => {
    const { clock, store, bus, monitor, dials, okDial } = setup();
    const out = await bringSoundboxDown({ store, clock, bus, monitor, merchantId: "m012", dial: okDial, sleep: noSleep });
    expect(out.escalated).toBe(false);
    expect(dials).toEqual([]);
    expect(monitor.tile("m012").status).toBe("green");
  });

  it("refuses a second run for the same merchant while one is running", async () => {
    const { clock, store, bus, monitor, okDial } = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const first = bringSoundboxDown({ store, clock, bus, monitor, merchantId: RAVI_ID, dial: okDial, sleep: () => gate });
    await expect(bringSoundboxDown({ store, clock, bus, monitor, merchantId: RAVI_ID, dial: okDial, sleep: noSleep })).rejects.toThrow(/already running/);
    release();
    await first;
  });
});
