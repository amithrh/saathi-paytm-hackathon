/** Shared domain types used by backend, agent, voice, dashboard and tests. */

export type Language = "hi-IN" | "kn-IN" | "en-IN";

/** The roles Saathi's reasoning trace names. One agent, several hats. */
export type Role = "Manager" | "Diagnoser" | "Fixer" | "Seller" | "Compliance";

/** Who produced a log line: an agent role, a human, or the (simulated) merchant backend. */
export type Actor = Role | "Human" | "System";

export interface Consent {
  /** Merchant agreed to service calls about their own account (briefings, outages). */
  serviceCalls: boolean;
  /** Merchant agreed to hear promotional offers (loans, upgrades). */
  promotionalCalls: boolean;
  /** Merchant agreed to Saathi messaging their customers about udhaar on their behalf. */
  udhaarReminders: boolean;
  /** Merchant opted in to WhatsApp. */
  whatsapp: boolean;
  consentedOn: string; // ISO date
}

export type DeviceType = "soundbox" | "qr" | "edc";
export type DeviceStatus = "online" | "offline";

export interface DeviceEvent {
  at: string; // ISO
  kind: "offline" | "online" | "restart";
  note: string;
  /** Payments attempted while the device was offline and never announced/confirmed. */
  unconfirmed?: { count: number; amount: number };
}

export interface Device {
  id: string;
  type: DeviceType;
  model: string;
  status: DeviceStatus;
  lastHeartbeat: string;
  events: DeviceEvent[];
}

export type SettlementStatus = "settled" | "failed" | "pending";

export interface Settlement {
  id: string;
  date: string; // YYYY-MM-DD, IST
  amount: number;
  status: SettlementStatus;
  bankRef?: string;
  failureReason?: string;
  retriedAt?: string;
}

export type UdhaarStatus = "outstanding" | "reminded" | "paid";

export interface UdhaarEntry {
  customerId: string;
  customerName: string;
  customerPhone: string;
  /** Customer is on the TRAI DND registry (promotional messages blocked). */
  customerDnd: boolean;
  amount: number;
  since: string; // YYYY-MM-DD
  items: string;
  status: UdhaarStatus;
  remindedAt?: string;
  paidAt?: string;
}

export type TxnChannel = "upi_qr" | "soundbox" | "card" | "cash";

export interface Transaction {
  id: string;
  at: string; // ISO
  amount: number;
  channel: TxnChannel;
  status: "success" | "failed";
}

export interface SeasonalMonth {
  month: string; // YYYY-MM
  total: number;
}

/** Ninety-day history behind the credit signal. Seeded; in production these come from settlement and device logs. */
export interface CreditHistory {
  settlementDays90: number;
  settlementsOnTime90: number;
  uptimePct30: number;
  udhaarRecoveredPct: number;
  priorLoans: number;
  priorLoansOnTime: number;
}

export interface LoanProfile {
  creditScore: number;
  existingLoan: boolean;
  monthsOnPaytm: number;
}

export type LoanOfferStatus = "offered" | "awaiting_human_approval" | "approved" | "declined" | "handed_to_lender";

export interface LoanOffer {
  id: string;
  amount: number;
  tenureMonths: number;
  annualRate: number;
  lender: string;
  reason: string;
  merchantConsented: boolean;
  status: LoanOfferStatus;
  approvalId?: string;
  offeredAt: string;
}

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  merchantId: string;
  action: string;
  details: string;
  amount?: number;
  status: ApprovalStatus;
  requestedAt: string;
  decidedAt?: string;
}

export interface Merchant {
  id: string;
  mid: string; // Paytm-style merchant id (mock)
  ownerName: string;
  shopName: string;
  category: string;
  area: string;
  city: string;
  language: Language;
  phone: string;
  consent: Consent;
  dndRegistered: boolean;
  devices: Device[];
  settlements: Settlement[];
  udhaar: UdhaarEntry[];
  transactions: Transaction[];
  /** Same months, last year. Used for the seasonal (Diwali) loan reasoning. */
  seasonalLastYear: SeasonalMonth[];
  /** Monday to yesterday of the current week, so the scoreboard opens with a week-to-date figure. */
  weekSoFar: Counters;
  loanProfile: LoanProfile;
  creditHistory: CreditHistory;
  loanOffers: LoanOffer[];
}

export interface Counters {
  /** Rupees recovered: failed settlements retried, unconfirmed Soundbox payments confirmed. */
  recovered: number;
  /** Rupees of udhaar collected after a reminder. */
  collected: number;
  /** Rupees of working capital offered. */
  offered: number;
  /** Support tickets the merchant never had to raise: each leak fixed before a call to the helpline. */
  ticketsAvoided: number;
}

export interface ActionLogEntry {
  id: string;
  at: string;
  merchantId: string;
  callId?: string;
  actor: Actor;
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** One human-readable English line for the dashboard. */
  summary: string;
  /** The ledger lines or records behind the summary, e.g. "Soundbox SB-7F42 event log 18:02 to 10:15". */
  source?: string;
  result?: unknown;
  ms: number;
}

export type WhatsAppDelivery =
  | { mode: "mock"; note: string }
  | { mode: "live"; provider: string; sid: string; status: string }
  | { mode: "failed"; provider: string; error: string };

export interface ComplianceCheckLine {
  rule: string;
  ref: string;
  passed: boolean;
  detail: string;
}

export type ComplianceAction = "service_call" | "send_reminder" | "offer_loan";

/** One line of the on-screen compliance panel. */
export interface ComplianceGate {
  key: string;
  label: string;
  status: "pass" | "fail" | "pending";
  detail: string;
}

export interface ComplianceResult {
  action: ComplianceAction;
  allowed: boolean;
  ticketId?: string;
  checks: ComplianceCheckLine[];
  gates: ComplianceGate[];
  refusalReason?: string;
  checkedAt: string;
  expiresAt?: string;
}

export interface TurnLatency {
  turn: number;
  sttMs: number;
  llmMs: number;
  toolsMs: number;
  ttsMs: number;
  totalMs: number;
  llmCalls: number;
}

export type CallState = "idle" | "preparing" | "ringing" | "live" | "ended";

/** Events pushed to the dashboard and the call screen over SSE / WebSocket. */
export type ServerEvent =
  | { type: "action"; entry: ActionLogEntry }
  | { type: "counters"; merchantId: string; counters: Counters }
  | { type: "merchant"; merchantId: string; snapshot: MerchantSnapshot }
  | { type: "call"; merchantId: string; callId: string; state: CallState; transport: string }
  | { type: "transcript"; merchantId: string; callId: string; speaker: "saathi" | "merchant"; text: string }
  | { type: "latency"; merchantId: string; callId: string; latency: TurnLatency }
  | { type: "whatsapp"; merchantId: string; to: string; toName: string; text: string; at: string; delivery: WhatsAppDelivery }
  | { type: "approval"; approval: ApprovalRequest }
  | { type: "reset"; merchantId: string }
  | { type: "fleet"; merchantId: string; status: FleetStatus; text: string; role?: Role; trigger?: string };

export type FleetStatus = "green" | "amber" | "red";

/** What the dashboard renders. Derived from the store, never mutated by clients. */
export interface MerchantSnapshot {
  merchant: Pick<Merchant, "id" | "ownerName" | "shopName" | "category" | "area" | "city" | "language" | "phone">;
  takings: { today: number; yesterday: number; sameDayLastWeek: number; todayCount: number; yesterdayCount: number };
  devices: Array<Pick<Device, "id" | "type" | "model" | "status" | "lastHeartbeat"> & { lastEvent?: DeviceEvent }>;
  settlements: Settlement[];
  udhaar: UdhaarEntry[];
  loanOffers: LoanOffer[];
  approvals: ApprovalRequest[];
  /** Week to date, what the scoreboard shows. */
  counters: Counters;
  /** This session only. */
  todayCounters: Counters;
  clockIst: string;
  credit: import("../backend/src/credit.js").CreditSignal;
  cashNeed: import("../backend/src/credit.js").CashNeed;
}
