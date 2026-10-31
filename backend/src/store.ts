import type {
  ApprovalRequest, ComplianceAction, Counters, LoanOffer, Merchant, MerchantSnapshot, Transaction,
} from "../../shared/types.js";
import { addDays, istDate, istInstant, istTime, type Clock } from "./clock.js";
import { buildMerchants } from "./seed.js";
import { cashNeed, creditSignal } from "./credit.js";

export interface ComplianceTicket {
  id: string;
  merchantId: string;
  action: ComplianceAction;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export const TICKET_TTL_MS = 10 * 60_000;

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/**
 * In-memory merchant backend. Everything the tools mutate lives here.
 * Swapping this for real Paytm APIs means re-implementing these methods against HTTP.
 */
export class MerchantStore {
  private merchants = new Map<string, Merchant>();
  private tickets = new Map<string, ComplianceTicket>();
  private approvals = new Map<string, ApprovalRequest>();
  private listeners = new Set<(merchantId: string) => void>();
  private seq = 0;
  /** Bumped on every reset, so delayed simulations from an earlier run can tell they are stale. */
  generation = 0;

  constructor(readonly clock: Clock, merchants: Merchant[]) {
    for (const m of merchants) this.merchants.set(m.id, m);
  }

  static seeded(clock: Clock): MerchantStore {
    return new MerchantStore(clock, buildMerchants(istDate(clock.now())));
  }

  /**
   * Back to the opening scene without a restart: reseed every merchant for the current (pinned) clock,
   * drop compliance tickets and approvals. Listeners and the clock are kept.
   */
  reset(): void {
    this.merchants.clear();
    for (const m of buildMerchants(istDate(this.clock.now()))) this.merchants.set(m.id, m);
    this.tickets.clear();
    this.approvals.clear();
    this.generation++;
    for (const id of this.merchants.keys()) this.changed(id);
  }

  onChange(listener: (merchantId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed(merchantId: string): void {
    for (const l of this.listeners) l(merchantId);
  }

  private nextId(prefix: string): string {
    this.seq++;
    return `${prefix}-${String(this.seq).padStart(4, "0")}`;
  }

  list(): Merchant[] {
    return [...this.merchants.values()];
  }

  get(id: string): Merchant {
    const m = this.merchants.get(id);
    if (!m) throw new NotFoundError(`merchant ${id}`);
    return m;
  }

  // ---- read models -------------------------------------------------------

  /** Successful transactions on an IST date, up to `now` (so "today" grows through the day). */
  transactionsOn(merchantId: string, date: string, now = this.clock.now()): Transaction[] {
    const start = istInstant(date, 0).toISOString();
    const end = istInstant(addDays(date, 1), 0).toISOString();
    const cutoff = now.toISOString();
    return this.get(merchantId).transactions.filter((t) => t.status === "success" && t.at >= start && t.at < end && t.at <= cutoff);
  }

  takings(merchantId: string, now = this.clock.now()): MerchantSnapshot["takings"] {
    const today = istDate(now);
    const sum = (ts: Transaction[]) => ts.reduce((s, t) => s + t.amount, 0);
    const t = this.transactionsOn(merchantId, today, now);
    const y = this.transactionsOn(merchantId, addDays(today, -1), now);
    const lw = this.transactionsOn(merchantId, addDays(today, -8), now);
    return { today: sum(t), yesterday: sum(y), sameDayLastWeek: sum(lw), todayCount: t.length, yesterdayCount: y.length };
  }

  counters(merchantId: string): Counters {
    const m = this.get(merchantId);
    const recovered =
      m.settlements.filter((s) => s.retriedAt && s.status === "settled").reduce((a, s) => a + s.amount, 0) +
      m.devices.flatMap((d) => d.events).filter((e) => e.kind === "restart" && e.unconfirmed).reduce((a, e) => a + (e.unconfirmed?.amount ?? 0), 0);
    const collected = m.udhaar.filter((u) => u.status === "paid" && u.remindedAt).reduce((a, u) => a + u.amount, 0);
    const offered = m.loanOffers.filter((o) => o.status !== "declined").reduce((a, o) => a + o.amount, 0);
    const ticketsAvoided =
      m.devices.filter((d) => d.events.some((e) => e.kind === "restart" && e.unconfirmed)).length +
      m.settlements.filter((s) => s.retriedAt && s.status === "settled").length;
    return { recovered, collected, offered, ticketsAvoided };
  }

  /** Live counters plus the seeded week-to-date baseline: what the scoreboard shows. */
  weekCounters(merchantId: string): Counters {
    const live = this.counters(merchantId);
    const w = this.get(merchantId).weekSoFar;
    return { recovered: w.recovered + live.recovered, collected: w.collected + live.collected, offered: w.offered + live.offered, ticketsAvoided: w.ticketsAvoided + live.ticketsAvoided };
  }

  /** Fleet scene: a Soundbox stops heartbeating `minutesAgo` minutes ago while payments keep landing. */
  injectDeviceSilence(merchantId: string, minutesAgo: number, unconfirmed: { count: number; amount: number }): void {
    const m = this.get(merchantId);
    const d = m.devices.find((x) => x.type === "soundbox");
    if (!d) throw new NotFoundError(`soundbox for ${merchantId}`);
    const at = new Date(this.clock.now().getTime() - minutesAgo * 60_000).toISOString();
    d.status = "offline";
    d.lastHeartbeat = at;
    d.events.push({ at, kind: "offline", note: `Silent for ${minutesAgo} min while ${unconfirmed.count} payments landed in the app unannounced`, unconfirmed });
    this.changed(merchantId);
  }

  /** Fleet scene: the oldest open udhaar line crosses the ageing threshold. Returns that line. */
  ageUdhaar(merchantId: string, days: number): Merchant["udhaar"][number] {
    const m = this.get(merchantId);
    const open = m.udhaar.filter((u) => u.status === "outstanding").sort((a, b) => b.amount - a.amount);
    const u = open[0];
    if (!u) throw new NotFoundError(`open udhaar for ${merchantId}`);
    u.since = addDays(istDate(this.clock.now()), -days);
    this.changed(merchantId);
    return u;
  }

  /** The human hands an approved offer to the lending partner. The agent has no path to this. */
  handoffLoan(offerId: string): LoanOffer {
    for (const m of this.merchants.values()) {
      const o = m.loanOffers.find((x) => x.id === offerId);
      if (o) {
        if (o.status !== "approved") throw new Error(`offer ${offerId} is ${o.status}, not approved`);
        o.status = "handed_to_lender";
        this.changed(m.id);
        return o;
      }
    }
    throw new NotFoundError(`offer ${offerId}`);
  }

  approvalsFor(merchantId: string): ApprovalRequest[] {
    return [...this.approvals.values()].filter((a) => a.merchantId === merchantId);
  }

  snapshot(merchantId: string): MerchantSnapshot {
    const m = this.get(merchantId);
    const now = this.clock.now();
    return {
      merchant: { id: m.id, ownerName: m.ownerName, shopName: m.shopName, category: m.category, area: m.area, city: m.city, language: m.language, phone: m.phone },
      takings: this.takings(merchantId, now),
      devices: m.devices.map((d) => ({ id: d.id, type: d.type, model: d.model, status: d.status, lastHeartbeat: d.lastHeartbeat, ...(d.events.length ? { lastEvent: d.events[d.events.length - 1]! } : {}) })),
      settlements: m.settlements,
      udhaar: m.udhaar,
      loanOffers: m.loanOffers,
      approvals: this.approvalsFor(merchantId),
      counters: this.weekCounters(merchantId),
      todayCounters: this.counters(merchantId),
      clockIst: `${istDate(now)} ${istTime(now)} IST`,
      credit: creditSignal(m, now),
      cashNeed: cashNeed(m, now),
    };
  }

  // ---- mutations ----------------------------------------------------------

  restartDevice(merchantId: string, deviceId: string): { device: Merchant["devices"][number]; confirmed: { count: number; amount: number } } {
    const m = this.get(merchantId);
    const device = m.devices.find((d) => d.id === deviceId);
    if (!device) throw new NotFoundError(`device ${deviceId}`);
    const now = this.clock.now().toISOString();
    const pending = [...device.events].reverse().find((e) => e.kind === "offline")?.unconfirmed;
    const alreadyRestarted = device.status === "online";
    const confirmed = alreadyRestarted || !pending ? { count: 0, amount: 0 } : { count: pending.count, amount: pending.amount };
    device.events.push({
      at: now,
      kind: "restart",
      note: alreadyRestarted ? "Remote restart requested; device was already online" : `Remote restart via device cloud; ${confirmed.count} unconfirmed payments re-announced`,
      ...(confirmed.amount > 0 ? { unconfirmed: confirmed } : {}),
    });
    device.status = "online";
    device.lastHeartbeat = now;
    this.changed(merchantId);
    return { device, confirmed };
  }

  retrySettlement(merchantId: string, settlementId: string): Merchant["settlements"][number] {
    const m = this.get(merchantId);
    const s = m.settlements.find((x) => x.id === settlementId);
    if (!s) throw new NotFoundError(`settlement ${settlementId}`);
    if (s.status === "settled") return s;
    s.status = "settled";
    s.retriedAt = this.clock.now().toISOString();
    s.bankRef = `UTR${String(Date.UTC(2026, 0, 1) + this.seq * 7919).slice(-12)}`;
    delete s.failureReason;
    this.changed(merchantId);
    return s;
  }

  markReminded(merchantId: string, customerId: string): Merchant["udhaar"][number] {
    const m = this.get(merchantId);
    const u = m.udhaar.find((x) => x.customerId === customerId);
    if (!u) throw new NotFoundError(`customer ${customerId}`);
    if (u.status === "outstanding") u.status = "reminded";
    u.remindedAt = this.clock.now().toISOString();
    this.changed(merchantId);
    return u;
  }

  markUdhaarPaid(merchantId: string, customerId: string): Merchant["udhaar"][number] {
    const m = this.get(merchantId);
    const u = m.udhaar.find((x) => x.customerId === customerId);
    if (!u) throw new NotFoundError(`customer ${customerId}`);
    u.status = "paid";
    u.paidAt = this.clock.now().toISOString();
    this.changed(merchantId);
    return u;
  }

  addLoanOffer(merchantId: string, offer: Omit<LoanOffer, "id" | "offeredAt">): LoanOffer {
    const m = this.get(merchantId);
    const full: LoanOffer = { ...offer, id: this.nextId("LOAN"), offeredAt: this.clock.now().toISOString() };
    m.loanOffers.push(full);
    this.changed(merchantId);
    return full;
  }

  createApproval(req: Omit<ApprovalRequest, "id" | "status" | "requestedAt">): ApprovalRequest {
    const a: ApprovalRequest = { ...req, id: this.nextId("APR"), status: "pending", requestedAt: this.clock.now().toISOString() };
    this.approvals.set(a.id, a);
    this.changed(req.merchantId);
    return a;
  }

  decideApproval(id: string, decision: "approved" | "rejected"): ApprovalRequest {
    const a = this.approvals.get(id);
    if (!a) throw new NotFoundError(`approval ${id}`);
    a.status = decision;
    a.decidedAt = this.clock.now().toISOString();
    const m = this.get(a.merchantId);
    for (const o of m.loanOffers) {
      if (o.approvalId === id) o.status = decision === "approved" ? "approved" : "declined";
    }
    this.changed(a.merchantId);
    return a;
  }

  // ---- compliance tickets -------------------------------------------------

  issueTicket(merchantId: string, action: ComplianceAction): ComplianceTicket {
    const now = this.clock.now();
    const t: ComplianceTicket = {
      id: `CMP-${action === "send_reminder" ? "REM" : action === "offer_loan" ? "LOAN" : "CALL"}-${String(++this.seq).padStart(4, "0")}`,
      merchantId,
      action,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TICKET_TTL_MS).toISOString(),
    };
    this.tickets.set(t.id, t);
    return t;
  }

  /** A valid (unexpired, unconsumed) ticket for this merchant+action; if `ticketId` is given it must be that one. */
  findValidTicket(merchantId: string, action: ComplianceAction, ticketId?: string): ComplianceTicket | undefined {
    const now = this.clock.now().toISOString();
    const candidates = [...this.tickets.values()].filter(
      (t) => t.merchantId === merchantId && t.action === action && !t.consumedAt && t.expiresAt > now && (!ticketId || t.id === ticketId),
    );
    return candidates.sort((a, b) => (a.issuedAt < b.issuedAt ? 1 : -1))[0];
  }

  consumeTicket(id: string): void {
    const t = this.tickets.get(id);
    if (t) t.consumedAt = this.clock.now().toISOString();
  }
}
