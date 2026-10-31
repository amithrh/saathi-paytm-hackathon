import type { Actor, FleetStatus, Role } from "../../shared/types.js";
import { daysBetween, istDate, istTime, type Clock } from "./clock.js";
import { creditSignal, type CreditBand } from "./credit.js";
import type { EventBus } from "./events.js";
import { UDHAAR_AGEING_DAYS } from "./policy.js";
import { FLEET_IDS } from "./seed.js";
import type { MerchantStore } from "./store.js";
import { runToolByName, type ToolContext } from "./tools.js";

/** What the fleet tiles show, beyond raw store state: who is working on a merchant and why. */
export interface FleetOverlay {
  status?: FleetStatus;
  text?: string;
  role?: Role;
  trigger?: string;
  /** Shown as a link on the tile when the phone call could not be placed. */
  fallbackUrl?: string;
}

export interface FleetTile {
  id: string;
  shopName: string;
  ownerName: string;
  area: string;
  language: string;
  device: "online" | "silent";
  deviceNote: string;
  settlement: "settled" | "stuck";
  settlementNote: string;
  udhaarOldestDays: number;
  udhaarOpen: number;
  todayTakings: number;
  credit: { score: number; band: CreditBand; limit: number };
  status: FleetStatus;
  text: string;
  role?: Role;
  trigger?: string;
  fallbackUrl?: string;
}

export interface FleetSnapshot {
  tiles: FleetTile[];
  scoreboard: { recovered: number; collected: number; offered: number; ticketsAvoided: number; watched: number; openLeaks: number };
  sceneRunning: boolean;
  clockIst: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Keeps per-merchant overlays and turns call events for the escalated merchant into tile states. */
export class FleetMonitor {
  readonly overlays = new Map<string, FleetOverlay>();
  sceneRunning = false;

  constructor(private readonly store: MerchantStore, private readonly clock: Clock, private readonly bus: EventBus) {
    bus.subscribe((e) => {
      if (e.type === "reset") {
        this.overlays.delete(e.merchantId);
        this.sceneRunning = false;
      }
      if (e.type !== "call" || !this.overlays.has(e.merchantId)) return;
      if (e.state === "live") this.set(e.merchantId, { status: "amber", role: "Manager", text: `On a call with ${this.first(e.merchantId)} now` });
      if (e.state === "ended") {
        this.overlays.delete(e.merchantId);
        this.publish(e.merchantId, { status: "green", role: "Manager", text: "Call done; actions on the dashboard" });
      }
    });
  }

  private first(id: string): string {
    return this.store.get(id).ownerName.split(" ")[0] ?? id;
  }

  set(merchantId: string, o: FleetOverlay): void {
    this.overlays.set(merchantId, o);
    this.publish(merchantId, o);
  }

  clear(merchantId: string, o: FleetOverlay): void {
    this.overlays.delete(merchantId);
    this.publish(merchantId, o);
  }

  publish(merchantId: string, o: FleetOverlay): void {
    this.bus.publish({ type: "fleet", merchantId, status: o.status ?? "green", text: o.text ?? "", ...(o.role ? { role: o.role } : {}), ...(o.trigger ? { trigger: o.trigger } : {}) });
  }

  tile(id: string): FleetTile {
    const m = this.store.get(id);
    const now = this.clock.now();
    const today = istDate(now);
    const sb = m.devices.find((d) => d.type === "soundbox");
    const silent = m.devices.find((d) => d.status === "offline");
    const stuck = m.settlements.find((s) => s.status !== "settled");
    const open = m.udhaar.filter((u) => u.status !== "paid");
    const oldest = open.reduce((mx, u) => Math.max(mx, daysBetween(u.since, today)), 0);
    const credit = creditSignal(m, now);
    const o = this.overlays.get(id) ?? {};
    const leak = silent
      ? `Soundbox silent since ${istTime(new Date(silent.lastHeartbeat))}`
      : stuck
        ? `Settlement ${inr(stuck.amount)} ${stuck.status} past T+1`
        : undefined;
    const status: FleetStatus = o.status ?? (leak ? "red" : "green");
    return {
      id,
      shopName: m.shopName,
      ownerName: m.ownerName,
      area: m.area,
      language: m.language === "kn-IN" ? "ಕನ್ನಡ" : "हिंदी",
      device: silent ? "silent" : "online",
      deviceNote: silent ? `silent since ${istTime(new Date(silent.lastHeartbeat))}` : sb ? `heartbeat ${istTime(new Date(sb.lastHeartbeat))}` : "no device",
      settlement: stuck ? "stuck" : "settled",
      settlementNote: stuck ? `${inr(stuck.amount)} ${stuck.status}` : "all credited",
      udhaarOldestDays: oldest,
      udhaarOpen: open.reduce((s, u) => s + u.amount, 0),
      todayTakings: this.store.takings(id, now).today,
      credit: { score: credit.score, band: credit.band, limit: credit.limit },
      status,
      text: o.text ?? (leak ? "Detected, queued for Saathi" : "Watching"),
      ...(o.role ? { role: o.role } : {}),
      ...(o.fallbackUrl ? { fallbackUrl: o.fallbackUrl } : {}),
      ...(o.trigger ?? leak ? { trigger: (o.trigger ?? leak)! } : {}),
    };
  }

  snapshot(): FleetSnapshot {
    const tiles = FLEET_IDS.map((id) => this.tile(id));
    const sum = { recovered: 0, collected: 0, offered: 0, ticketsAvoided: 0 };
    for (const id of FLEET_IDS) {
      const c = this.store.weekCounters(id);
      sum.recovered += c.recovered;
      sum.collected += c.collected;
      sum.offered += c.offered;
      sum.ticketsAvoided += c.ticketsAvoided;
    }
    const openLeaks = tiles.reduce((n, t) => n + (t.device === "silent" ? 1 : 0) + (t.settlement === "stuck" ? 1 : 0), 0);
    const now = this.clock.now();
    return { tiles, scoreboard: { ...sum, watched: tiles.length, openLeaks }, sceneRunning: this.sceneRunning, clockIst: `${istDate(now)} ${istTime(now)} IST` };
  }
}

/** Seconds between beats. Multiply with `speed` (2 = twice as slow). Total is about 60 s at speed 1. */
export const FLEET_SCENE_TIMINGS = {
  /** Gap between incidents. */
  incidentGapMs: 18_000,
  /** Gap between roles inside one incident (detect, act, stamp). */
  beatMs: 3_000,
} as const;

export const FLEET_SCENE = {
  silentDevice: "m003",
  stuckSettlement: "m002",
  ageingUdhaar: "m004",
  escalation: "m001",
} as const;

export type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export interface FleetSceneDeps {
  store: MerchantStore;
  clock: Clock;
  bus: EventBus;
  monitor: FleetMonitor;
  /** Tool context extras (WhatsApp sender, customer phones) so the scene runs the same tools as a call. */
  toolExtras?: Pick<ToolContext, "whatsapp" | "customerPhones">;
  sleep?: Sleep;
  speed?: number;
  log?: (line: string) => void;
}

/**
 * Three leaks handled three ways, then one escalation to a human conversation.
 * Every action is a real tool call against the store, logged with its role; the scene only decides timing.
 */
export async function runFleetScene(d: FleetSceneDeps): Promise<void> {
  const { store, clock, bus, monitor } = d;
  if (monitor.sceneRunning) throw new Error("fleet scene already running");
  const sleep = d.sleep ?? realSleep;
  const speed = d.speed ?? 1;
  const gen = store.generation;
  const wait = async (ms: number) => {
    await sleep(ms * speed);
    if (store.generation !== gen) throw new Error("scene reset");
  };
  const ctx = (merchantId: string): ToolContext => ({ store, clock, bus, merchantId, callId: "fleet-scene", ...(d.toolExtras ?? {}) });
  const note = (merchantId: string, actor: Actor, tool: string, summary: string, source?: string) =>
    bus.publish({ type: "action", entry: { id: `F-${merchantId}-${tool}-${Date.now()}`, at: clock.now().toISOString(), merchantId, actor, tool, args: {}, ok: true, summary, ...(source ? { source } : {}), ms: 0 } });

  monitor.sceneRunning = true;
  try {
    // 1. Soundbox silent while payments keep landing: fixed with no human contact.
    {
      const id = FLEET_SCENE.silentDevice;
      store.injectDeviceSilence(id, 45, { count: 5, amount: 980 });
      monitor.set(id, { status: "red", role: "Diagnoser", trigger: "Soundbox silent 45 min while payments keep landing", text: "Diagnoser: 5 payments, ₹980, landed unannounced" });
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      await runToolByName("get_briefing", {}, ctx(id));
      const sb = store.get(id).devices.find((x) => x.type === "soundbox")!;
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      monitor.set(id, { status: "red", role: "Fixer", trigger: "Soundbox silent 45 min while payments keep landing", text: `Fixer: restarting ${sb.id}` });
      await runToolByName("restart_device", { device_id: sb.id }, ctx(id));
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      note(id, "Compliance", "compliance_note", "No customer contact needed: device fix only, merchant notified in the daily summary", "Saathi policy: service fixes need no consent ticket");
      monitor.clear(id, { status: "green", role: "Compliance", text: "Fixed, ₹980 confirmed. No customer contact needed" });
    }
    await wait(FLEET_SCENE_TIMINGS.incidentGapMs - 3 * FLEET_SCENE_TIMINGS.beatMs);

    // 2. Settlement stuck past T+1: retried.
    {
      const id = FLEET_SCENE.stuckSettlement;
      const st = store.get(id).settlements.find((x) => x.status !== "settled");
      if (st) {
        monitor.set(id, { status: "red", role: "Diagnoser", trigger: `Settlement ${inr(st.amount)} pending past T+1`, text: `Diagnoser: ${st.failureReason ?? "bank timeout"}` });
        await wait(FLEET_SCENE_TIMINGS.beatMs);
        await runToolByName("get_briefing", {}, ctx(id));
        await wait(FLEET_SCENE_TIMINGS.beatMs);
        monitor.set(id, { status: "red", role: "Fixer", trigger: `Settlement ${inr(st.amount)} pending past T+1`, text: "Fixer: retrying the settlement" });
        await runToolByName("retry_settlement", { settlement_id: st.id }, ctx(id));
        await wait(FLEET_SCENE_TIMINGS.beatMs);
        monitor.clear(id, { status: "green", role: "Fixer", text: `Settled, ${inr(st.amount)} on its way to the bank` });
      }
    }
    await wait(FLEET_SCENE_TIMINGS.incidentGapMs - 3 * FLEET_SCENE_TIMINGS.beatMs);

    // 3. Udhaar crosses 10 days: reminder to the customer, consent-gated.
    {
      const id = FLEET_SCENE.ageingUdhaar;
      const u = store.ageUdhaar(id, UDHAAR_AGEING_DAYS + 1);
      const trigger = `${u.customerName} owes ${inr(u.amount)}, ${UDHAAR_AGEING_DAYS + 1} days`;
      monitor.set(id, { status: "amber", role: "Diagnoser", trigger, text: "Diagnoser: udhaar line crossed 10 days" });
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      await runToolByName("get_briefing", {}, ctx(id));
      monitor.set(id, { status: "amber", role: "Compliance", trigger, text: "Compliance: consent, window, P2M link" });
      const c = await runToolByName("compliance_check", { action: "send_reminder", customer_id: u.customerId }, ctx(id));
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      if (c.ok) {
        monitor.set(id, { status: "amber", role: "Fixer", trigger, text: `Fixer: WhatsApp reminder to ${u.customerName}` });
        await runToolByName("send_reminder", { customer_id: u.customerId }, ctx(id));
        await wait(FLEET_SCENE_TIMINGS.beatMs);
        monitor.clear(id, { status: "green", role: "Fixer", text: `Reminder sent to ${u.customerName} with a P2M link` });
      } else {
        monitor.clear(id, { status: "amber", role: "Compliance", trigger, text: "Compliance refused; left for the merchant" });
      }
    }
    await wait(FLEET_SCENE_TIMINGS.incidentGapMs - 3 * FLEET_SCENE_TIMINGS.beatMs);

    // 4. Ravi: three triggers and a credit need. This one needs a conversation.
    {
      const id = FLEET_SCENE.escalation;
      monitor.set(id, { status: "red", role: "Diagnoser", trigger: "Soundbox silent · Suresh 12 days · Diwali stock-up", text: "Diagnoser: three triggers on one shop" });
      await runToolByName("get_briefing", {}, ctx(id));
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      monitor.set(id, { status: "red", role: "Seller", trigger: "Soundbox silent · Suresh 12 days · Diwali stock-up", text: "Seller: credit signal checked" });
      await runToolByName("check_loan_eligibility", {}, ctx(id));
      await wait(FLEET_SCENE_TIMINGS.beatMs);
      note(id, "Manager", "escalate_to_call", "Escalating to a call: a reminder and a loan need the merchant's yes, so Saathi will phone Ravi", "fleet rule: anything that needs consent goes to a conversation");
      monitor.set(id, { status: "amber", role: "Manager", trigger: "Soundbox silent · Suresh 12 days · Diwali stock-up", text: "Manager: escalating to a call · calling Ravi" });
    }
    d.log?.("fleet scene: done, Ravi waiting for the call");
  } catch (e) {
    d.log?.(`fleet scene stopped: ${(e as Error).message}`);
    if ((e as Error).message !== "scene reset") throw e;
  } finally {
    monitor.sceneRunning = false;
  }
}
