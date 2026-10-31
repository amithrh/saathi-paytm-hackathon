/**
 * What the model may not do, and the deterministic rules that start a call.
 * Shown on the dashboard and enforced in code: the LLM never sees these as "advice", it sees tool results.
 */
export const LLM_PROHIBITIONS = [
  { rule: "No arithmetic", how: "Every rupee figure Saathi speaks comes from a tool result; a number audit flags any spoken amount with no backing line." },
  { rule: "No money movement", how: "The agent has no tool that transfers, refunds or disburses. Disbursal is a human button handed to the lending partner." },
  { rule: "No limit changes", how: "Loan amount is capped by check_loan_eligibility; offer_loan rejects anything above it and never raises a limit." },
  { rule: "No loan talk without consent", how: "offer_loan needs merchant_consented=true on this call and a compliance ticket; the merchant's promotional opt-in is checked first." },
  { rule: "No reminder without the merchant", how: "send_reminder runs only after the merchant says yes on the call and compliance issues a ticket; one ticket, one message." },
] as const;

export interface TriggerRule {
  key: "device_silent" | "settlement_stuck" | "udhaar_ageing";
  rule: string;
  threshold: string;
}

export const TRIGGER_RULES: readonly TriggerRule[] = [
  { key: "device_silent", rule: "Device silent while inflows continue", threshold: "no heartbeat for more than 30 minutes while payments keep landing in the app" },
  { key: "settlement_stuck", rule: "Settlement pending or failed past T+1", threshold: "yesterday's settlement not credited by the next morning" },
  { key: "udhaar_ageing", rule: "Udhaar ledger line ageing", threshold: "a customer's line older than 10 days" },
];

export const DEVICE_SILENT_MINUTES = 30;
export const UDHAAR_AGEING_DAYS = 10;
