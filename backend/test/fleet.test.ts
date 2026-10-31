import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../shared/types.js";
import { fixedClock } from "../src/clock.js";
import { EventBus } from "../src/events.js";
import { FLEET_SCENE, FleetMonitor, runFleetScene } from "../src/fleet.js";
import { FLEET_IDS } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";

function setup() {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const monitor = new FleetMonitor(store, clock, bus);
  return { clock, store, bus, events, monitor };
}

describe("fleet snapshot", () => {
  it("shows ten tiles; only the two seeded overnight leaks are red at the start", () => {
    const { monitor } = setup();
    const s = monitor.snapshot();
    expect(s.tiles.map((t) => t.id)).toEqual([...FLEET_IDS]);
    expect(s.tiles.filter((t) => t.status === "red").map((t) => t.id)).toEqual(["m001", "m002"]);
    expect(s.scoreboard).toMatchObject({ watched: 10, openLeaks: 2 });
    const ravi = s.tiles[0]!;
    expect(ravi).toMatchObject({ device: "silent", credit: { band: "eligible" }, trigger: "Soundbox silent since 18:02" });
    expect(s.tiles.find((t) => t.id === "m006")!.credit.band).toBe("not yet");
  });
});

describe("fleet scene", () => {
  it("handles three leaks three ways, then escalates Ravi to a call", async () => {
    const { clock, store, bus, events, monitor } = setup();
    const before = monitor.snapshot().scoreboard;
    await runFleetScene({ store, clock, bus, monitor, sleep: async () => undefined });
    const actions = events.filter((e) => e.type === "action").map((e) => `${(e as { entry: { merchantId: string } }).entry.merchantId}:${(e as { entry: { actor: string } }).entry.actor}:${(e as { entry: { tool: string } }).entry.tool}`);
    expect(actions).toEqual([
      "m003:Diagnoser:get_briefing", "m003:Fixer:restart_device", "m003:Compliance:compliance_note",
      "m002:Diagnoser:get_briefing", "m002:Fixer:retry_settlement",
      "m004:Diagnoser:get_briefing", "m004:Compliance:compliance_check", "m004:Fixer:send_reminder",
      "m001:Diagnoser:get_briefing", "m001:Seller:check_loan_eligibility", "m001:Manager:escalate_to_call",
    ]);
    const after = monitor.snapshot();
    expect(after.scoreboard.recovered - before.recovered).toBe(980 + 8450);
    expect(after.scoreboard.ticketsAvoided - before.ticketsAvoided).toBe(2);
    const byId = Object.fromEntries(after.tiles.map((t) => [t.id, t]));
    expect(byId.m003).toMatchObject({ status: "green", device: "online" });
    expect(byId.m002).toMatchObject({ status: "green", settlement: "settled" });
    expect(byId.m004!.status).toBe("green");
    expect(store.get("m004").udhaar.some((u) => u.status === "reminded")).toBe(true);
    expect(byId.m001).toMatchObject({ status: "amber", role: "Manager" });
    expect(byId.m001!.text).toMatch(/calling Ravi/);
    // Ravi is not fixed by the scene: the real call does that.
    expect(byId.m001!.device).toBe("silent");
    const fleetStates = events.filter((e) => e.type === "fleet" && e.merchantId === FLEET_SCENE.silentDevice).map((e) => (e as { status: string }).status);
    expect(fleetStates[0]).toBe("red");
    expect(fleetStates.at(-1)).toBe("green");
    expect(monitor.sceneRunning).toBe(false);
  });

  it("the escalated tile follows the real call: on call, then green", async () => {
    const { clock, store, bus, monitor } = setup();
    await runFleetScene({ store, clock, bus, monitor, sleep: async () => undefined });
    bus.publish({ type: "call", merchantId: "m001", callId: "c", state: "live", transport: "phone" });
    expect(monitor.tile("m001").text).toMatch(/On a call with Ravi/);
    store.restartDevice("m001", "SB-7F42");
    bus.publish({ type: "call", merchantId: "m001", callId: "c", state: "ended", transport: "phone" });
    expect(monitor.tile("m001").status).toBe("green");
  });

  it("refuses a second run while one is running, and stops cleanly on reset", async () => {
    const { clock, store, bus, monitor, events } = setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let first = true;
    const run = runFleetScene({ store, clock, bus, monitor, sleep: async () => { if (first) { first = false; await gate; } } });
    await expect(runFleetScene({ store, clock, bus, monitor, sleep: async () => undefined })).rejects.toThrow(/already running/);
    store.reset();
    for (const m of store.list()) bus.publish({ type: "reset", merchantId: m.id });
    release();
    await run;
    expect(events.some((e) => e.type === "action" && e.entry.tool === "restart_device")).toBe(false);
    expect(monitor.snapshot().tiles.filter((t) => t.status !== "green").map((t) => t.id)).toEqual(["m001", "m002"]);
  });

  it("speed scales every wait", async () => {
    const { clock, store, bus, monitor } = setup();
    const waits: number[] = [];
    await runFleetScene({ store, clock, bus, monitor, speed: 2, sleep: async (ms) => void waits.push(ms) });
    expect(waits.reduce((a, b) => a + b, 0)).toBe(2 * waits.reduce((a, b) => a + b / 2, 0));
    expect(waits.reduce((a, b) => a + b, 0) / 2).toBeGreaterThanOrEqual(50_000);
    expect(waits.reduce((a, b) => a + b, 0) / 2).toBeLessThanOrEqual(70_000);
  });
});
