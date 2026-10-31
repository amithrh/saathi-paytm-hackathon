import type { Actor } from "../../shared/types.js";
import { daysBetween, istDate, type Clock } from "./clock.js";
import type { EventBus } from "./events.js";
import type { FleetMonitor } from "./fleet.js";
import { UDHAAR_AGEING_DAYS } from "./policy.js";
import type { MerchantStore } from "./store.js";
import { runToolByName, type ToolContext } from "./tools.js";

/** Timings for the "Bring Soundbox down" demo. `speed` multiplies them (2 = twice as slow). */
export const BRING_DOWN_TIMINGS = {
  /** A payment lands unannounced this often while the device is silent. */
  paymentEveryMs: 2_500,
  /** Rupee amounts that land, one per tick; 8 ticks is about 20 s. */
  payments: [120, 340, 85, 260, 410, 150, 95, 230],
  /** Pause between roles (detect, fix, stamp, escalate). */
  beatMs: 2_500,
} as const;

export interface EscalationFacts {
  unannouncedAmount: number;
  oldestUdhaarDays: number;
}

/** Fixing the device needs no one; money the merchant never heard about plus an ageing udhaar needs a conversation. */
export function shouldEscalate(f: EscalationFacts): boolean {
  return f.unannouncedAmount > 0 && f.oldestUdhaarDays >= UDHAAR_AGEING_DAYS;
}

export type DialResult = { ok: true; callSid: string; status: string } | { ok: false; error: string };
export type Dialer = (merchantId: string, to?: string) => Promise<DialResult>;

export interface BringDownDeps {
  store: MerchantStore;
  clock: Clock;
  bus: EventBus;
  monitor: FleetMonitor;
  merchantId: string;
  dial: Dialer;
  /** Phone to ring; the dialer falls back to DEMO_PHONE_NUMBER. */
  to?: string;
  speed?: number;
  sleep?: (ms: number) => Promise<void>;
  toolExtras?: Pick<ToolContext, "whatsapp" | "customerPhones">;
  log?: (line: string) => void;
}

export interface BringDownOutcome {
  unannounced: { count: number; amount: number };
  escalated: boolean;
  dial?: DialResult;
}

const running = new Set<string>();
export const bringDownRunning = (merchantId: string) => running.has(merchantId);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Soundbox goes silent, payments keep landing, Diagnoser and Fixer work it, and if the merchant needs a
 * conversation the Manager escalates and dials the merchant through the existing Twilio path.
 */
export async function bringSoundboxDown(d: BringDownDeps): Promise<BringDownOutcome> {
  const { store, clock, bus, monitor, merchantId: id } = d;
  if (running.has(id)) throw new Error(`a bring-down is already running for ${id}`);
  running.add(id);
  const speed = d.speed ?? 1;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const gen = store.generation;
  const wait = async (ms: number) => {
    await sleep(ms * speed);
    if (store.generation !== gen) throw new Error("scene reset");
  };
  const ctx: ToolContext = { store, clock, bus, merchantId: id, callId: "bring-down", ...(d.toolExtras ?? {}) };
  const note = (actor: Actor, tool: string, summary: string, source?: string) =>
    bus.publish({ type: "action", entry: { id: `B-${id}-${tool}-${Date.now()}`, at: clock.now().toISOString(), merchantId: id, actor, tool, args: {}, ok: true, summary, ...(source ? { source } : {}), ms: 0 } });
  const first = store.get(id).ownerName.split(" ")[0] ?? id;
  try {
    const sb = store.get(id).devices.find((x) => x.type === "soundbox");
    if (!sb) throw new Error(`${id} has no Soundbox`);
    store.silenceSoundbox(id);
    const trigger = `Soundbox ${sb.id} silent while payments keep landing`;
    monitor.set(id, { status: "red", role: "Diagnoser", trigger, text: "Diagnoser: heartbeat stopped, watching payments" });
    let un = { count: 0, amount: 0 };
    for (const amount of BRING_DOWN_TIMINGS.payments) {
      await wait(BRING_DOWN_TIMINGS.paymentEveryMs);
      un = store.addUnannouncedPayment(id, amount);
      monitor.set(id, { status: "red", role: "Diagnoser", trigger, text: `Diagnoser: ${un.count} payments, ${inr(un.amount)} landed unannounced` });
    }
    // The unannounced total includes anything already silent from before (Ravi's overnight 7 payments).
    const pending = [...(store.get(id).devices.find((x) => x.id === sb.id)?.events ?? [])].reverse().find((e) => e.kind === "offline")?.unconfirmed ?? un;
    note("Diagnoser", "trigger_fired", `Device silent while ${pending.count} payments (${inr(pending.amount)}) landed unannounced: customers heard nothing`, `demo threshold ${Math.round((BRING_DOWN_TIMINGS.paymentEveryMs * BRING_DOWN_TIMINGS.payments.length * speed) / 1000)} s; production rule is 30 min`);
    await runToolByName("get_briefing", {}, ctx);
    await wait(BRING_DOWN_TIMINGS.beatMs);
    monitor.set(id, { status: "red", role: "Fixer", trigger, text: `Fixer: restarting ${sb.id}` });
    await runToolByName("restart_device", { device_id: sb.id }, ctx);
    await wait(BRING_DOWN_TIMINGS.beatMs);
    note("Compliance", "compliance_note", "No customer contact needed for the device fix; logged", "Saathi policy: service fixes need no consent ticket");

    const m = store.get(id);
    const today = istDate(clock.now());
    const oldest = m.udhaar.filter((u) => u.status !== "paid").reduce((mx, u) => Math.max(mx, daysBetween(u.since, today)), 0);
    const escalate = shouldEscalate({ unannouncedAmount: pending.amount, oldestUdhaarDays: oldest });
    if (!escalate) {
      monitor.clear(id, { status: "green", role: "Fixer", text: `Fixed: ${inr(pending.amount)} confirmed, no call needed` });
      return { unannounced: pending, escalated: false };
    }
    await wait(BRING_DOWN_TIMINGS.beatMs);
    note("Manager", "escalate_to_call", `Escalating to a call: ${inr(pending.amount)} the merchant never heard about, and udhaar ${oldest} days old needs the merchant's yes`, "rule: unannounced money plus udhaar ≥ 10 days → talk to the merchant");
    monitor.set(id, { status: "amber", role: "Manager", trigger, text: `Manager: escalating to a call · calling ${first}` });
    const dial = await d.dial(id, d.to);
    if (dial.ok) {
      note("Manager", "dial", `Calling ${first} now (Twilio ${dial.status})`, `call ${dial.callSid}`);
      monitor.set(id, { status: "amber", role: "Manager", trigger, text: `Manager: calling ${first} · phone ringing` });
    } else {
      bus.publish({ type: "action", entry: { id: `B-${id}-dial-${Date.now()}`, at: clock.now().toISOString(), merchantId: id, actor: "Manager", tool: "dial", args: {}, ok: false, summary: `Phone call failed: ${dial.error}. Use the laptop call screen`, ms: 0 } });
      monitor.set(id, { status: "amber", role: "Manager", trigger, text: `Call failed: ${dial.error}`, fallbackUrl: `/call?merchant=${id}` });
    }
    return { unannounced: pending, escalated: true, dial };
  } catch (e) {
    if ((e as Error).message === "scene reset") return { unannounced: { count: 0, amount: 0 }, escalated: false };
    d.log?.(`bring-down ${id}: ${(e as Error).message}`);
    throw e;
  } finally {
    running.delete(id);
  }
}
