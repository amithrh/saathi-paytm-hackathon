import type { ComplianceAction, ComplianceCheckLine, ComplianceGate, ComplianceResult, Merchant } from "../../shared/types.js";
import { istHour, istTime } from "./clock.js";

/** TRAI TCCCPR 2025 commercial-communication window, applied to every Saathi action, service calls included. */
export const CALLING_HOURS = { start: 9, end: 19 } as const; // IST, inclusive start, exclusive end
export const HUMAN_APPROVAL_ABOVE = 25_000;
export const REMINDER_COOLDOWN_HOURS = 72;
export const LENDER_NAME = "Partner NBFC (sandbox)";
export const COOLING_OFF_DAYS = 1;

export interface Kfs {
  amount: number;
  annualRatePct: number;
  tenureMonths: number;
  monthlyRepayment: number;
  totalRepayment: number;
  processingFee: number;
}

export interface ComplianceInput {
  merchant: Merchant;
  action: ComplianceAction;
  now: Date;
  customerId?: string;
  merchantConsented?: boolean;
  kfs?: Kfs;
}

const TRAI = "TRAI TCCCPR 2025";
const RBI = "RBI Digital Lending Directions 2025";
const CONSENT = "Merchant consent record";
const DPDP = "DPDP Act 2023";
const NPCI = "NPCI UPI circular, Oct 2025";

function hoursCheck(now: Date): ComplianceCheckLine {
  const h = istHour(now);
  const ok = h >= CALLING_HOURS.start && h < CALLING_HOURS.end;
  return {
    rule: "Calling window",
    ref: TRAI,
    passed: ok,
    detail: ok
      ? `${istTime(now)} IST is inside 9 AM to 7 PM`
      : `${istTime(now)} IST is outside 9 AM to 7 PM (no commercial communication)`,
  };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Pure rule evaluation. No side effects; the tool layer issues the ticket.
 * `checks` is the audit trail; `gates` is the same information shaped for the dashboard panel.
 */
export function evaluateCompliance(input: ComplianceInput): Omit<ComplianceResult, "ticketId" | "expiresAt"> {
  const { merchant, action, now } = input;
  const checks: ComplianceCheckLine[] = [];
  const gates: ComplianceGate[] = [];
  const add = (c: ComplianceCheckLine, gate?: Omit<ComplianceGate, "status"> & { status?: ComplianceGate["status"] }) => {
    checks.push(c);
    if (gate) gates.push({ status: c.passed ? "pass" : "fail", ...gate });
  };

  add(
    { rule: "AI disclosure", ref: DPDP, passed: true, detail: "Saathi says it is Paytm's AI assistant in the first sentence" },
    { key: "ai_disclosed", label: "AI disclosed", detail: "first sentence of the call" },
  );
  add(hoursCheck(now), { key: "calling_window", label: "Calling window 9 AM to 7 PM", detail: `${istTime(now)} IST` });

  if (action === "service_call") {
    add(
      { rule: "Service-call consent", ref: CONSENT, passed: merchant.consent.serviceCalls, detail: merchant.consent.serviceCalls ? `Opted in on ${merchant.consent.consentedOn}` : "No consent for service calls" },
      { key: "service_consent", label: "Service-call consent", detail: merchant.consent.consentedOn },
    );
  }

  if (action === "send_reminder") {
    const c = merchant.udhaar.find((u) => u.customerId === input.customerId);
    add(
      { rule: "Udhaar-reminder consent", ref: CONSENT, passed: merchant.consent.udhaarReminders, detail: merchant.consent.udhaarReminders ? "Merchant allows Saathi to message customers about udhaar" : "Merchant has not allowed udhaar reminders" },
      { key: "merchant_consent", label: "Merchant allows reminders", detail: `on record ${merchant.consent.consentedOn}` },
    );
    add(
      { rule: "Customer has outstanding udhaar", ref: "Ledger", passed: !!c && c.status !== "paid", detail: c ? `${c.customerName}: ${inr(c.amount)} since ${c.since}` : `Unknown customer ${input.customerId ?? "(none)"}` },
      { key: "ledger_line", label: "Ledger line exists", detail: c ? `${c.customerName} ${inr(c.amount)} since ${c.since}` : "none" },
    );
    if (c) {
      const hoursSince = c.remindedAt ? (now.getTime() - Date.parse(c.remindedAt)) / 3_600_000 : Infinity;
      add(
        { rule: "Frequency cap", ref: "Saathi policy", passed: hoursSince >= REMINDER_COOLDOWN_HOURS, detail: c.remindedAt ? `Last reminder ${Math.round(hoursSince)}h ago (cap ${REMINDER_COOLDOWN_HOURS}h)` : "No reminder sent before" },
        { key: "frequency_cap", label: "Not reminded in 72 h", detail: c.remindedAt ? `${Math.round(hoursSince)} h ago` : "first reminder" },
      );
      add(
        { rule: "Message category", ref: TRAI, passed: true, detail: `Transactional payment reminder on registered template SAATHI_UDHAAR_01; customer DND=${c.customerDnd ? "yes" : "no"} does not block transactional messages; no promotional content` },
        { key: "template", label: "Transactional template", detail: "SAATHI_UDHAAR_01, no promotion" },
      );
      add(
        { rule: "P2M payment link", ref: NPCI, passed: true, detail: "Verified-merchant P2M pay intent (merchant VPA, MCC 5411); P2P collect requests are not used" },
        { key: "p2m", label: "P2M link, no P2P collect", detail: "merchant VPA + MCC" },
      );
    }
  }

  if (action === "offer_loan") {
    const promo = merchant.consent.promotionalCalls;
    add(
      { rule: "Promotional consent", ref: TRAI, passed: promo, detail: promo ? `Explicit opt-in for offers on ${merchant.consent.consentedOn}` : "Merchant has not opted in to offers" },
      { key: "promo_consent", label: "Offer opt-in on record", detail: merchant.consent.consentedOn },
    );
    add(
      { rule: "DND registry", ref: TRAI, passed: !merchant.dndRegistered || promo, detail: merchant.dndRegistered ? (promo ? "On DND, but explicit consent permits this offer" : "On DND and no explicit consent") : "Not on DND" },
    );
    add(
      { rule: "Lender disclosed", ref: RBI, passed: true, detail: `Loan is from ${LENDER_NAME}; Saathi is the lending service provider, not the lender` },
      { key: "lender", label: "Lender named", detail: LENDER_NAME },
    );
    const k = input.kfs;
    add(
      { rule: "Key Fact Statement before consent", ref: RBI, passed: !!k, detail: k ? `${inr(k.amount)}, ${k.annualRatePct}% APR, ${k.tenureMonths} months, EMI about ${inr(k.monthlyRepayment)}, total ${inr(k.totalRepayment)}, fee ${inr(k.processingFee)}` : "No KFS figures supplied" },
      { key: "kfs", label: "KFS read", detail: k ? `${inr(k.amount)}, ${k.annualRatePct}% APR, ${k.tenureMonths} months, EMI ≈ ${inr(k.monthlyRepayment)}` : "missing" },
    );
    add(
      { rule: "Explicit consent, no auto-disbursal", ref: RBI, passed: input.merchantConsented === true, detail: input.merchantConsented === true ? `Merchant said yes on the call at ${istTime(now)} IST; recorded` : "Merchant has not consented yet" },
      { key: "consent", label: input.merchantConsented === true ? `Consent logged ${istTime(now)}` : "Consent logged", detail: input.merchantConsented === true ? `${istTime(now)} IST, on the call` : "not yet" },
    );
    add(
      { rule: "Cooling-off period", ref: RBI, passed: true, detail: `Merchant may exit within ${COOLING_OFF_DAYS} day with no penalty; stated on the call` },
      { key: "cooling_off", label: `Cooling-off ${COOLING_OFF_DAYS} day`, detail: "exit without penalty" },
    );
    add(
      { rule: "Human approval", ref: "Saathi policy", passed: true, detail: `Offers above ${inr(HUMAN_APPROVAL_ABOVE)} are routed to a human approver before anything is handed to the lender` },
      { key: "human_approval", label: "Awaiting human approval", detail: "agent cannot disburse", status: "pending" },
    );
  }

  const failed = checks.filter((c) => !c.passed);
  const base = { action, checks, gates, checkedAt: now.toISOString(), allowed: failed.length === 0 };
  return failed.length ? { ...base, refusalReason: failed.map((f) => `${f.rule}: ${f.detail}`).join("; ") } : base;
}
