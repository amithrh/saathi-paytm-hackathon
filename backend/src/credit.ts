import type { CreditHistory, Merchant } from "../../shared/types.js";
import { daysBetween, istDate } from "./clock.js";

/**
 * Credit signal: a deterministic, explainable score computed by code from the merchant's own data.
 * The language model never computes or adjusts it; it only reads the result.
 */
export type CreditBand = "not yet" | "watch" | "eligible" | "strong";

export interface CreditComponent {
  key: "settlement_regularity" | "takings_trend" | "udhaar_recovery" | "device_uptime" | "repayment_history";
  label: string;
  /** Human-readable measured value, e.g. "86 of 90 days on time". */
  value: string;
  /** 0-100 sub-score. */
  score: number;
  weight: number;
}

export interface CreditSignal {
  score: number;
  band: CreditBand;
  limit: number;
  components: CreditComponent[];
  monthlyDigital: number;
  note: string;
}

export interface CashNeed {
  active: boolean;
  triggers: Array<{ kind: "seasonal_stock_up" | "stuck_settlement"; detail: string }>;
  festival: string;
  festivalDate: string;
  daysToFestival: number;
  festiveLiftPct: number;
}

export const CREDIT_WEIGHTS = { settlement_regularity: 0.25, takings_trend: 0.2, udhaar_recovery: 0.15, device_uptime: 0.15, repayment_history: 0.25 } as const;
export const BANDS: Array<{ band: CreditBand; min: number }> = [
  { band: "strong", min: 78 },
  { band: "eligible", min: 62 },
  { band: "watch", min: 50 },
  { band: "not yet", min: 0 },
];
export const SEASONAL_WINDOW_DAYS = 30;
export const SEASONAL_MIN_LIFT_PCT = 15;

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function diwaliDate(year: number): string {
  // Lakshmi Puja dates. 2026-11-08 is the one that matters for this demo.
  const table: Record<number, string> = { 2025: "2025-10-20", 2026: "2026-11-08", 2027: "2027-10-29" };
  return table[year] ?? `${year}-11-01`;
}

function last30(m: Merchant, now: Date, digitalOnly: boolean): number {
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const to = now.toISOString();
  return m.transactions.filter((t) => t.status === "success" && (!digitalOnly || t.channel !== "cash") && t.at >= from && t.at <= to).reduce((s, t) => s + t.amount, 0);
}

export function creditSignal(m: Merchant, now: Date): CreditSignal {
  const h: CreditHistory = m.creditHistory;
  const monthlyDigital = last30(m, now, true);
  const monthlyAll = last30(m, now, false);
  const lastYearAvg = m.seasonalLastYear.reduce((s, x) => s + x.total, 0) / Math.max(1, m.seasonalLastYear.length);
  const trendPct = Math.round(((monthlyAll - lastYearAvg) / lastYearAvg) * 100);
  const repaymentScore = m.loanProfile.existingLoan ? 35 : h.priorLoans === 0 ? 60 : clamp((h.priorLoansOnTime / h.priorLoans) * 100);
  const components: CreditComponent[] = [
    { key: "settlement_regularity", label: "Settlement regularity (90 d)", value: `${h.settlementsOnTime90} of ${h.settlementDays90} days settled on time`, score: clamp((h.settlementsOnTime90 / h.settlementDays90) * 100), weight: CREDIT_WEIGHTS.settlement_regularity },
    { key: "takings_trend", label: "Takings trend vs last year", value: `last 30 d ${inr(monthlyAll)} vs last year's monthly mean ${inr(lastYearAvg)} (${trendPct >= 0 ? "+" : ""}${trendPct}%)`, score: clamp(50 + trendPct * 2.5), weight: CREDIT_WEIGHTS.takings_trend },
    { key: "udhaar_recovery", label: "Udhaar recovery rate", value: `${h.udhaarRecoveredPct}% of udhaar recovered within 30 d`, score: clamp(h.udhaarRecoveredPct), weight: CREDIT_WEIGHTS.udhaar_recovery },
    { key: "device_uptime", label: "Device uptime (30 d)", value: `${h.uptimePct30}% Soundbox uptime`, score: clamp((h.uptimePct30 - 70) * (100 / 30)), weight: CREDIT_WEIGHTS.device_uptime },
    { key: "repayment_history", label: "Prior repayment history", value: m.loanProfile.existingLoan ? "has a running loan" : h.priorLoans === 0 ? "no prior loan (thin file, neutral)" : `${h.priorLoansOnTime} of ${h.priorLoans} loans repaid on time`, score: repaymentScore, weight: CREDIT_WEIGHTS.repayment_history },
  ];
  const score = clamp(components.reduce((s, c) => s + c.score * c.weight, 0));
  const band = BANDS.find((b) => score >= b.min)!.band;
  const pct = band === "strong" ? 0.2 : band === "eligible" ? 0.15 : 0;
  const thinBusiness = m.loanProfile.monthsOnPaytm < 6 || monthlyDigital < 40_000;
  const limit = pct && !thinBusiness ? Math.min(200_000, Math.max(10_000, Math.round((monthlyDigital * pct) / 10_000) * 10_000)) : 0;
  return { score, band, limit, components, monthlyDigital, note: "Computed by code from settlement, takings, ledger and device data; the model never computes or changes it." };
}

/** A loan is only offered when there is a reason the merchant needs cash now. */
export function cashNeed(m: Merchant, now: Date): CashNeed {
  const today = istDate(now);
  const festivalDate = diwaliDate(Number(today.slice(0, 4)));
  const daysToFestival = daysBetween(today, festivalDate);
  const months = m.seasonalLastYear;
  const avg = months.reduce((s, x) => s + x.total, 0) / Math.max(1, months.length);
  const oct = months.find((x) => x.month.endsWith("-10"))?.total ?? avg;
  const nov = months.find((x) => x.month.endsWith("-11"))?.total ?? avg;
  const festiveLiftPct = Math.round(((Math.max(oct, nov) - avg) / avg) * 100);
  const festival = m.language === "kn-IN" ? "Deepavali" : "Diwali";
  const triggers: CashNeed["triggers"] = [];
  if (daysToFestival > 0 && daysToFestival <= SEASONAL_WINDOW_DAYS && festiveLiftPct >= SEASONAL_MIN_LIFT_PCT) {
    triggers.push({ kind: "seasonal_stock_up", detail: `${festival} in ${daysToFestival} days; last year sales rose ${festiveLiftPct}%` });
  }
  for (const s of m.settlements.filter((x) => x.status !== "settled")) {
    triggers.push({ kind: "stuck_settlement", detail: `settlement ${s.id} of ${inr(s.amount)} ${s.status} since ${s.date}` });
  }
  return { active: triggers.length > 0, triggers, festival, festivalDate, daysToFestival, festiveLiftPct };
}
