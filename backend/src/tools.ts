import type { ActionLogEntry, Actor, ComplianceAction, ComplianceResult, Language, Role } from "../../shared/types.js";
import { daysBetween, istDate, istTime, type Clock } from "./clock.js";
import { evaluateCompliance, HUMAN_APPROVAL_ABOVE, LENDER_NAME } from "./compliance.js";
import type { EventBus } from "./events.js";
import { MerchantStore, NotFoundError } from "./store.js";

/** JSON Schema subset we hand to the LLM. */
export interface JsonSchema {
  type: "object";
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

export interface ToolContext {
  store: MerchantStore;
  clock: Clock;
  merchantId: string;
  callId?: string;
  bus?: EventBus;
}

export interface ToolDef {
  name: string;
  role: Role;
  description: string;
  parameters: JsonSchema;
  run(args: Record<string, unknown>, ctx: ToolContext): unknown;
  /** English one-liner for the dashboard log, from args and result. */
  summarize(args: Record<string, unknown>, result: unknown, ctx: ToolContext): string;
}

export class ToolError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ToolError";
  }
}

const inr = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;

function str(args: Record<string, unknown>, key: string, required = true): string {
  const v = args[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (required) throw new ToolError("BAD_ARGS", `${key} is required`);
  return "";
}

function num(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^0-9.]/g, "")) : NaN;
  if (!Number.isFinite(n)) throw new ToolError("BAD_ARGS", `${key} must be a number`);
  return n;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return undefined;
}

function festivalForLanguage(lang: Language): string {
  return lang === "kn-IN" ? "Deepavali" : "Diwali";
}

export function diwaliDate(year: number): string {
  // Lakshmi Puja dates. 2026-11-08 is the one that matters for this demo.
  const table: Record<number, string> = { 2025: "2025-10-20", 2026: "2026-11-08", 2027: "2027-10-29" };
  return table[year] ?? `${year}-11-01`;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

export const getBriefing: ToolDef = {
  name: "get_briefing",
  role: "Diagnoser",
  description: "Pull the merchant's morning briefing: yesterday's takings, today so far, device health issues, failed settlements, overdue udhaar and a loan hint. Call this first on every call.",
  parameters: { type: "object", properties: {} },
  run(_args, ctx) {
    const m = ctx.store.get(ctx.merchantId);
    const now = ctx.clock.now();
    const today = istDate(now);
    const takings = ctx.store.takings(ctx.merchantId, now);
    const vsLastWeek = takings.sameDayLastWeek ? Math.round(((takings.yesterday - takings.sameDayLastWeek) / takings.sameDayLastWeek) * 100) : 0;
    const devices = m.devices.map((d) => {
      const off = [...d.events].reverse().find((e) => e.kind === "offline");
      const restart = [...d.events].reverse().find((e) => e.kind === "restart");
      const issue = off && (!restart || restart.at < off.at)
        ? { offline_since_ist: istTime(new Date(off.at)), offline_date: istDate(new Date(off.at)), unconfirmed_payments: off.unconfirmed?.count ?? 0, unconfirmed_amount: off.unconfirmed?.amount ?? 0 }
        : undefined;
      return { device_id: d.id, type: d.type, status: d.status, ...(issue ? { issue } : {}), ...(restart ? { last_restart_ist: istTime(new Date(restart.at)), restart_note: restart.note } : {}) };
    });
    const failed = m.settlements.filter((s) => s.status === "failed").map((s) => ({ settlement_id: s.id, amount: s.amount, date: s.date, reason: s.failureReason }));
    const udhaar = m.udhaar
      .filter((u) => u.status !== "paid")
      .map((u) => ({ customer_id: u.customerId, name: u.customerName, amount: u.amount, days_outstanding: daysBetween(u.since, today), status: u.status }))
      .sort((a, b) => b.amount - a.amount);
    const elig = loanEligibility(ctx);
    const suggested: Array<{ tool: string; args: Record<string, unknown>; why: string }> = [];
    for (const d of devices) if (d.issue) suggested.push({ tool: "restart_device", args: { device_id: d.device_id }, why: `${d.type} offline since ${d.issue.offline_since_ist}, ${d.issue.unconfirmed_payments} payments unconfirmed` });
    for (const s of failed) suggested.push({ tool: "retry_settlement", args: { settlement_id: s.settlement_id }, why: `settlement of ${inr(s.amount)} failed` });
    return {
      merchant: { name: m.ownerName, shop: m.shopName, area: m.area, language: m.language },
      date: today,
      time_ist: istTime(now),
      yesterday: { total: takings.yesterday, payments: takings.yesterdayCount, vs_same_day_last_week_pct: vsLastWeek },
      today_so_far: { total: takings.today, payments: takings.todayCount },
      devices,
      failed_settlements: failed,
      udhaar_overdue: udhaar,
      loan_hint: elig.eligible ? { eligible: true, amount: elig.max_amount, reason: elig.reason_short } : { eligible: false },
      suggested_actions: suggested,
    };
  },
  summarize(_a, r) {
    const b = r as ReturnType<typeof getBriefing.run> & { yesterday: { total: number }; devices: Array<{ device_id: string; issue?: unknown }>; udhaar_overdue: Array<{ name: string; amount: number; days_outstanding: number }>; failed_settlements: unknown[] };
    const parts = [`yesterday ${inr(b.yesterday.total)}`];
    const bad = b.devices.filter((d) => d.issue).map((d) => d.device_id);
    if (bad.length) parts.push(`${bad.join(", ")} offline`);
    if (b.failed_settlements.length) parts.push(`${b.failed_settlements.length} settlement failed`);
    if (b.udhaar_overdue[0]) parts.push(`${b.udhaar_overdue[0].name} owes ${inr(b.udhaar_overdue[0].amount)} (${b.udhaar_overdue[0].days_outstanding} days)`);
    return `Briefing: ${parts.join("; ")}`;
  },
};

export const restartDevice: ToolDef = {
  name: "restart_device",
  role: "Fixer",
  description: "Remotely restart a Soundbox or EDC device that is offline. Safe, no consent needed. Re-announces payments that went unconfirmed while it was down.",
  parameters: { type: "object", properties: { device_id: { type: "string", description: "Device id from the briefing, e.g. SB-7F42" } }, required: ["device_id"] },
  run(args, ctx) {
    const id = str(args, "device_id");
    const { device, confirmed } = ctx.store.restartDevice(ctx.merchantId, id);
    return { ok: true, device_id: device.id, status: device.status, confirmed_payments: confirmed.count, confirmed_amount: confirmed.amount, restarted_at_ist: istTime(ctx.clock.now()) };
  },
  summarize(a, r) {
    const x = r as { confirmed_payments: number; confirmed_amount: number };
    return x.confirmed_payments ? `Restarted ${a.device_id}: back online, ${x.confirmed_payments} payments worth ${inr(x.confirmed_amount)} confirmed` : `Restarted ${a.device_id}: online`;
  },
};

export const retrySettlement: ToolDef = {
  name: "retry_settlement",
  role: "Fixer",
  description: "Retry a failed bank settlement so the merchant's money reaches their account. Safe, no consent needed.",
  parameters: { type: "object", properties: { settlement_id: { type: "string", description: "Settlement id from the briefing" } }, required: ["settlement_id"] },
  run(args, ctx) {
    const s = ctx.store.retrySettlement(ctx.merchantId, str(args, "settlement_id"));
    return { ok: true, settlement_id: s.id, amount: s.amount, status: s.status, bank_ref: s.bankRef, expected_credit: "within 30 minutes" };
  },
  summarize(a, r) {
    const x = r as { amount: number };
    return `Retried settlement ${a.settlement_id}: ${inr(x.amount)} settled, UTR issued`;
  },
};

export const complianceCheck: ToolDef = {
  name: "compliance_check",
  role: "Compliance",
  description: "Run the compliance check for an action and get a ticket. Required before send_reminder and before offer_loan. Checks consent, TRAI calling hours and DND, and RBI digital lending rules. For offer_loan, call it only after the merchant has said yes, with merchant_consented=true.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["service_call", "send_reminder", "offer_loan"], description: "The action you intend to take" },
      customer_id: { type: "string", description: "For send_reminder: the customer id from the briefing" },
      merchant_consented: { type: "boolean", description: "For offer_loan: true only if the merchant explicitly agreed on this call" },
    },
    required: ["action"],
  },
  run(args, ctx): ComplianceResult {
    const action = str(args, "action") as ComplianceAction;
    if (!["service_call", "send_reminder", "offer_loan"].includes(action)) throw new ToolError("BAD_ARGS", `unknown action ${action}`);
    const m = ctx.store.get(ctx.merchantId);
    const customerId = str(args, "customer_id", false);
    const consented = bool(args, "merchant_consented");
    const result = evaluateCompliance({ merchant: m, action, now: ctx.clock.now(), ...(customerId ? { customerId } : {}), ...(consented !== undefined ? { merchantConsented: consented } : {}) });
    if (!result.allowed) return result;
    const t = ctx.store.issueTicket(ctx.merchantId, action);
    return { ...result, ticketId: t.id, expiresAt: t.expiresAt };
  },
  summarize(a, r) {
    const x = r as ComplianceResult;
    const passed = x.checks.filter((c) => c.passed).length;
    return x.allowed
      ? `Compliance for ${a.action}: ${passed}/${x.checks.length} checks passed, ticket ${x.ticketId}`
      : `Compliance REFUSED ${a.action}: ${x.refusalReason}`;
  },
};

export function reminderText(lang: Language, shop: string, owner: string, customer: string, amount: number, upiLink: string): string {
  if (lang === "kn-IN") {
    return `ನಮಸ್ಕಾರ ${customer} ಅವರೇ, ${shop} (${owner}) ಕಡೆಯಿಂದ ನೆನಪಿಸುವಿಕೆ: ನಿಮ್ಮ ಬಾಕಿ ₹${amount.toLocaleString("en-IN")} ಇದೆ. ಅನುಕೂಲವಾದಾಗ ಈ ಲಿಂಕ್ ಮೂಲಕ UPI ಪಾವತಿಸಿ: ${upiLink} ಧನ್ಯವಾದಗಳು 🙏`;
  }
  return `नमस्ते ${customer} जी, ${shop} (${owner}) की ओर से एक छोटा सा रिमाइंडर: आपका ₹${amount.toLocaleString("en-IN")} का उधार बाकी है। सुविधा अनुसार इस लिंक से UPI पेमेंट कर दें: ${upiLink} धन्यवाद 🙏`;
}

export const sendReminder: ToolDef = {
  name: "send_reminder",
  role: "Fixer",
  description: "Send a polite WhatsApp reminder with a UPI payment link to a customer who owes udhaar. Only after the merchant asks for it on this call and compliance_check(action=send_reminder) has passed.",
  parameters: {
    type: "object",
    properties: {
      customer_id: { type: "string", description: "Customer id from the briefing, e.g. c-suresh" },
      compliance_ticket: { type: "string", description: "Ticket id returned by compliance_check" },
    },
    required: ["customer_id"],
  },
  run(args, ctx) {
    const customerId = str(args, "customer_id");
    const ticketId = str(args, "compliance_ticket", false) || undefined;
    const ticket = ctx.store.findValidTicket(ctx.merchantId, "send_reminder", ticketId);
    if (!ticket) throw new ToolError("COMPLIANCE_REQUIRED", "Run compliance_check with action=send_reminder for this customer first");
    const m = ctx.store.get(ctx.merchantId);
    const u = m.udhaar.find((x) => x.customerId === customerId);
    if (!u) throw new NotFoundError(`customer ${customerId}`);
    if (u.status === "paid") throw new ToolError("ALREADY_PAID", `${u.customerName} has already paid`);
    const upiLink = `upi://pay?pa=${m.mid.toLowerCase()}@paytm&pn=${encodeURIComponent(m.shopName)}&am=${u.amount}&tn=Udhaar`;
    const text = reminderText(m.language, m.shopName, m.ownerName, u.customerName, u.amount, upiLink);
    ctx.store.consumeTicket(ticket.id);
    const updated = ctx.store.markReminded(ctx.merchantId, customerId);
    ctx.bus?.publish({ type: "whatsapp", merchantId: m.id, to: u.customerPhone, toName: u.customerName, text, at: ctx.clock.now().toISOString() });
    return { ok: true, channel: "whatsapp", to: u.customerName, amount: u.amount, message: text, status: updated.status, delivery: "mocked: shown on dashboard and logged, real send is a transport swap" };
  },
  summarize(_a, r) {
    const x = r as { to: string; amount: number };
    return `WhatsApp reminder sent to ${x.to} for ${inr(x.amount)} with UPI link (mock channel)`;
  },
};

function loanEligibility(ctx: ToolContext) {
  const m = ctx.store.get(ctx.merchantId);
  const now = ctx.clock.now();
  const today = istDate(now);
  const last30 = m.transactions.filter((t) => t.status === "success" && t.channel !== "cash" && t.at >= new Date(now.getTime() - 30 * 86_400_000).toISOString() && t.at <= now.toISOString());
  const monthlyDigital = last30.reduce((s, t) => s + t.amount, 0);
  const year = Number(today.slice(0, 4));
  const diwali = diwaliDate(year);
  const daysToDiwali = daysBetween(today, diwali);
  const months = m.seasonalLastYear;
  const avg = months.reduce((s, x) => s + x.total, 0) / Math.max(1, months.length);
  const oct = months.find((x) => x.month.endsWith("-10"))?.total ?? avg;
  const nov = months.find((x) => x.month.endsWith("-11"))?.total ?? avg;
  const festiveLiftPct = Math.round(((Math.max(oct, nov) - avg) / avg) * 100);
  const score = m.loanProfile.creditScore;
  const eligible = score >= 680 && m.loanProfile.monthsOnPaytm >= 6 && !m.loanProfile.existingLoan && monthlyDigital > 40_000;
  const raw = monthlyDigital * 0.15;
  const maxAmount = Math.min(200_000, Math.max(10_000, Math.round(raw / 10_000) * 10_000));
  const festival = festivalForLanguage(m.language);
  const reasonShort = daysToDiwali > 0 && daysToDiwali <= 30
    ? `Last year sales rose ${festiveLiftPct}% around ${festival}; ${festival} is on ${diwali}, ${daysToDiwali} days away, so stock-up cash now pays back`
    : `Stable digital takings of ${inr(monthlyDigital)} in 30 days and a ${score} score`;
  return {
    eligible,
    max_amount: eligible ? maxAmount : 0,
    tenure_months: 6,
    annual_rate_pct: 18,
    lender: LENDER_NAME,
    processing_fee: 0,
    monthly_digital_takings: monthlyDigital,
    credit_score: score,
    months_on_paytm: m.loanProfile.monthsOnPaytm,
    existing_loan: m.loanProfile.existingLoan,
    festive_lift_last_year_pct: festiveLiftPct,
    festival,
    festival_date: diwali,
    days_to_festival: daysToDiwali,
    reason_short: reasonShort,
    requires_human_approval_above: HUMAN_APPROVAL_ABOVE,
  };
}

export const checkLoanEligibility: ToolDef = {
  name: "check_loan_eligibility",
  role: "Seller",
  description: "Check how much working capital the merchant qualifies for and why now is a good moment (seasonal pattern). Read-only.",
  parameters: { type: "object", properties: {} },
  run(_args, ctx) {
    return loanEligibility(ctx);
  },
  summarize(_a, r) {
    const x = r as ReturnType<typeof loanEligibility>;
    return x.eligible ? `Eligible for ${inr(x.max_amount)} at ${x.annual_rate_pct}% p.a. over ${x.tenure_months} months: ${x.reason_short}` : "Not eligible for a loan right now";
  },
};

export const requestHumanApproval: ToolDef = {
  name: "request_human_approval",
  role: "Manager",
  description: "Raise a flag for a human at Paytm to approve a risky action before it executes. Returns an approval id; the action stays pending until approved.",
  parameters: {
    type: "object",
    properties: {
      action: { type: "string", description: "What needs approval, e.g. offer_loan" },
      details: { type: "string", description: "One line of context" },
      amount: { type: "number", description: "Rupee amount involved, if any" },
    },
    required: ["action", "details"],
  },
  run(args, ctx) {
    const amount = args.amount === undefined ? undefined : num(args, "amount");
    const a = ctx.store.createApproval({ merchantId: ctx.merchantId, action: str(args, "action"), details: str(args, "details"), ...(amount !== undefined ? { amount } : {}) });
    ctx.bus?.publish({ type: "approval", approval: a });
    return { ok: true, approval_id: a.id, status: a.status, note: "A human will review on the dashboard; nothing is disbursed until approved" };
  },
  summarize(a, r) {
    const x = r as { approval_id: string };
    return `Human approval requested (${x.approval_id}) for ${a.action}${a.amount ? ` of ${inr(Number(a.amount))}` : ""}: pending`;
  },
};

export const offerLoan: ToolDef = {
  name: "offer_loan",
  role: "Seller",
  description: "Record the merchant's acceptance of a working-capital loan offer and route it for human approval. Only after check_loan_eligibility, after the merchant explicitly said yes, and after compliance_check(action=offer_loan, merchant_consented=true) passed.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Rupee amount, at most the eligible maximum" },
      merchant_consented: { type: "boolean", description: "Must be true; the merchant agreed on this call" },
      compliance_ticket: { type: "string", description: "Ticket id returned by compliance_check" },
    },
    required: ["amount", "merchant_consented"],
  },
  run(args, ctx) {
    const amount = num(args, "amount");
    if (bool(args, "merchant_consented") !== true) throw new ToolError("CONSENT_REQUIRED", "Ask the merchant and only call offer_loan with merchant_consented=true after they agree");
    const ticketId = str(args, "compliance_ticket", false) || undefined;
    const ticket = ctx.store.findValidTicket(ctx.merchantId, "offer_loan", ticketId);
    if (!ticket) throw new ToolError("COMPLIANCE_REQUIRED", "Run compliance_check with action=offer_loan and merchant_consented=true first");
    const elig = loanEligibility(ctx);
    if (!elig.eligible) throw new ToolError("NOT_ELIGIBLE", "Merchant is not eligible");
    if (amount > elig.max_amount) throw new ToolError("OVER_LIMIT", `Maximum is ${elig.max_amount}`);
    ctx.store.consumeTicket(ticket.id);
    const needsHuman = amount > HUMAN_APPROVAL_ABOVE;
    let approvalId: string | undefined;
    if (needsHuman) {
      const approvalResult = runTool(requestHumanApproval, { action: "offer_loan", details: `${inr(amount)} working capital, ${elig.tenure_months} months at ${elig.annual_rate_pct}% from ${elig.lender}. ${elig.reason_short}`, amount }, ctx);
      approvalId = (approvalResult.result as { approval_id: string }).approval_id;
    }
    const offer = ctx.store.addLoanOffer(ctx.merchantId, {
      amount,
      tenureMonths: elig.tenure_months,
      annualRate: elig.annual_rate_pct,
      lender: elig.lender,
      reason: elig.reason_short,
      merchantConsented: true,
      status: needsHuman ? "awaiting_human_approval" : "approved",
      ...(approvalId ? { approvalId } : {}),
    });
    const monthly = Math.round((amount * (1 + (elig.annual_rate_pct / 100) * (elig.tenure_months / 12))) / elig.tenure_months);
    return { ok: true, offer_id: offer.id, amount, tenure_months: offer.tenureMonths, annual_rate_pct: offer.annualRate, approx_monthly_repayment: monthly, lender: offer.lender, status: offer.status, approval_id: approvalId ?? null, next_step: needsHuman ? "A Paytm team member approves on the dashboard; the merchant gets a WhatsApp with the Key Fact Statement, then disbursal" : "Disbursal queued" };
  },
  summarize(_a, r) {
    const x = r as { amount: number; status: string; approval_id: string | null };
    return `Loan of ${inr(x.amount)} accepted by merchant, status ${x.status.replace(/_/g, " ")}${x.approval_id ? ` (${x.approval_id})` : ""}`;
  },
};

export const endCall: ToolDef = {
  name: "end_call",
  role: "Manager",
  description: "End the call after you have said goodbye. Call this when the merchant is done or says bye.",
  parameters: { type: "object", properties: { reason: { type: "string", description: "Why the call is ending" } } },
  run(args) {
    return { ok: true, reason: str(args, "reason", false) || "merchant done" };
  },
  summarize(_a, r) {
    return `Call ended: ${(r as { reason: string }).reason}`;
  },
};

export const TOOLS: readonly ToolDef[] = [getBriefing, restartDevice, retrySettlement, complianceCheck, sendReminder, checkLoanEligibility, offerLoan, requestHumanApproval, endCall];

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export interface ToolRunOutcome {
  entry: ActionLogEntry;
  result: unknown;
  ok: boolean;
}

let logSeq = 0;

/** Execute a tool, time it, log it with its role, publish the entry and any store-derived updates. */
export function runTool(tool: ToolDef, args: Record<string, unknown>, ctx: ToolContext, actor: Actor = tool.role): ToolRunOutcome {
  const started = Date.now();
  let result: unknown;
  let ok = true;
  let summary: string;
  try {
    result = tool.run(args, ctx);
    summary = tool.summarize(args, result, ctx);
    if (tool.name === "compliance_check" && !(result as ComplianceResult).allowed) ok = false;
  } catch (err) {
    ok = false;
    const e = err as Error & { code?: string };
    result = { ok: false, error: e.code ?? e.name, message: e.message };
    summary = `${tool.name} failed: ${e.message}`;
  }
  const entry: ActionLogEntry = {
    id: `A-${String(++logSeq).padStart(5, "0")}`,
    at: ctx.clock.now().toISOString(),
    merchantId: ctx.merchantId,
    ...(ctx.callId ? { callId: ctx.callId } : {}),
    actor,
    tool: tool.name,
    args,
    ok,
    summary,
    result,
    ms: Date.now() - started,
  };
  ctx.bus?.publish({ type: "action", entry });
  return { entry, result, ok };
}

/** Run a tool by name; unknown names produce a failed log entry instead of a throw so the agent loop stays alive. */
export function runToolByName(name: string, args: Record<string, unknown>, ctx: ToolContext): ToolRunOutcome {
  const tool = toolByName(name);
  if (!tool) {
    const entry: ActionLogEntry = { id: `A-${String(++logSeq).padStart(5, "0")}`, at: ctx.clock.now().toISOString(), merchantId: ctx.merchantId, actor: "Manager", tool: name, args, ok: false, summary: `Unknown tool ${name}`, result: { ok: false, error: "UNKNOWN_TOOL" }, ms: 0 };
    ctx.bus?.publish({ type: "action", entry });
    return { entry, result: entry.result, ok: false };
  }
  return runTool(tool, args, ctx);
}
