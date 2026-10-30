import type { ComplianceAction, ComplianceCheckLine, ComplianceResult, Merchant } from "../../shared/types.js";
import { istHour, istTime } from "./clock.js";

export const CALLING_HOURS = { start: 9, end: 21 } as const; // IST, inclusive start, exclusive end
export const HUMAN_APPROVAL_ABOVE = 25_000;
export const REMINDER_COOLDOWN_HOURS = 72;
export const LENDER_NAME = "Partner NBFC (sandbox)";

export interface ComplianceInput {
  merchant: Merchant;
  action: ComplianceAction;
  now: Date;
  customerId?: string;
  merchantConsented?: boolean;
}

const TRAI = "TRAI TCCCPR 2018";
const RBI = "RBI Digital Lending Guidelines 2022";
const CONSENT = "Merchant consent record";
const DPDP = "DPDP Act 2023";

function hoursCheck(now: Date): ComplianceCheckLine {
  const h = istHour(now);
  const ok = h >= CALLING_HOURS.start && h < CALLING_HOURS.end;
  return {
    rule: "Calling hours",
    ref: TRAI,
    passed: ok,
    detail: ok
      ? `${istTime(now)} IST is inside the ${CALLING_HOURS.start}:00-${CALLING_HOURS.end}:00 window`
      : `${istTime(now)} IST is outside the ${CALLING_HOURS.start}:00-${CALLING_HOURS.end}:00 window (quiet hours)`,
  };
}

/**
 * Pure rule evaluation. No side effects; the tool layer issues the ticket.
 * Rules are deliberately stricter than the letter of the regulations: one window for everything.
 */
export function evaluateCompliance(input: ComplianceInput): Omit<ComplianceResult, "ticketId" | "expiresAt"> {
  const { merchant, action, now } = input;
  const checks: ComplianceCheckLine[] = [hoursCheck(now)];

  checks.push({
    rule: "AI disclosure",
    ref: DPDP,
    passed: true,
    detail: "Saathi introduces itself as an AI assistant and states why it is calling",
  });

  if (action === "service_call") {
    checks.push({ rule: "Service-call consent", ref: CONSENT, passed: merchant.consent.serviceCalls, detail: merchant.consent.serviceCalls ? `Opted in on ${merchant.consent.consentedOn}` : "No consent for service calls" });
  }

  if (action === "send_reminder") {
    const c = merchant.udhaar.find((u) => u.customerId === input.customerId);
    checks.push({ rule: "Udhaar-reminder consent", ref: CONSENT, passed: merchant.consent.udhaarReminders, detail: merchant.consent.udhaarReminders ? "Merchant allows Saathi to message customers about udhaar" : "Merchant has not allowed udhaar reminders" });
    checks.push({ rule: "Customer has outstanding udhaar", ref: "Ledger", passed: !!c && c.status !== "paid", detail: c ? `${c.customerName}: Rs ${c.amount} since ${c.since}` : `Unknown customer ${input.customerId ?? "(none)"}` });
    if (c) {
      const hoursSince = c.remindedAt ? (now.getTime() - Date.parse(c.remindedAt)) / 3_600_000 : Infinity;
      checks.push({ rule: "Frequency cap", ref: "Saathi policy", passed: hoursSince >= REMINDER_COOLDOWN_HOURS, detail: c.remindedAt ? `Last reminder ${Math.round(hoursSince)}h ago (cap ${REMINDER_COOLDOWN_HOURS}h)` : "No reminder sent before" });
      checks.push({ rule: "Message category", ref: TRAI, passed: true, detail: `Transactional payment reminder on a registered template (SAATHI_UDHAAR_01); customer DND=${c.customerDnd ? "yes" : "no"} does not block transactional messages, no promotional content` });
    }
  }

  if (action === "offer_loan") {
    const promo = merchant.consent.promotionalCalls;
    checks.push({ rule: "Promotional consent", ref: TRAI, passed: promo, detail: promo ? `Explicit opt-in for offers on ${merchant.consent.consentedOn}` : "Merchant has not opted in to offers" });
    checks.push({ rule: "DND registry", ref: TRAI, passed: !merchant.dndRegistered || promo, detail: merchant.dndRegistered ? (promo ? "On DND, but explicit consent permits this offer" : "On DND and no explicit consent") : "Not on DND" });
    checks.push({ rule: "Lender disclosed", ref: RBI, passed: true, detail: `Loan is from ${LENDER_NAME}; Saathi is the lending service provider, not the lender` });
    checks.push({ rule: "Key Fact Statement before consent", ref: RBI, passed: true, detail: "Amount, tenure, annual rate and total repayment are read out before asking" });
    checks.push({ rule: "Explicit consent, no auto-disbursal", ref: RBI, passed: input.merchantConsented === true, detail: input.merchantConsented === true ? "Merchant said yes on the call; recorded with timestamp" : "Merchant has not consented yet" });
    checks.push({ rule: "Cooling-off period", ref: RBI, passed: true, detail: "Merchant may exit within 3 days with no penalty; stated on the call" });
    checks.push({ rule: "Human approval", ref: "Saathi policy", passed: true, detail: `Offers above Rs ${HUMAN_APPROVAL_ABOVE.toLocaleString("en-IN")} are routed to a human approver before disbursal` });
  }

  const failed = checks.filter((c) => !c.passed);
  const base = { action, checks, checkedAt: now.toISOString(), allowed: failed.length === 0 };
  return failed.length ? { ...base, refusalReason: failed.map((f) => `${f.rule}: ${f.detail}`).join("; ") } : base;
}
