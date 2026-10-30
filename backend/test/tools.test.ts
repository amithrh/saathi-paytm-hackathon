import { beforeEach, describe, expect, it } from "vitest";
import type { ComplianceResult, ServerEvent } from "../../shared/types.js";
import { fixedClock } from "../src/clock.js";
import { EventBus } from "../src/events.js";
import { LAKSHMI_ID, RAVI_ID } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";
import { runToolByName, TOOLS, type ToolContext } from "../src/tools.js";

const DAY = "2026-10-31T10:15:00+05:30";

function setup(merchantId = RAVI_ID, clockIso = DAY) {
  const clock = fixedClock(clockIso);
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const ctx: ToolContext = { store, clock, merchantId, callId: "call-test", bus };
  return { store, bus, events, ctx };
}

describe("tool registry", () => {
  it("exposes the agreed tools, each with a role", () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["get_briefing", "restart_device", "retry_settlement", "send_reminder", "check_loan_eligibility", "offer_loan", "request_human_approval", "compliance_check"]));
    expect(TOOLS.find((t) => t.name === "get_briefing")!.role).toBe("Diagnoser");
    expect(TOOLS.find((t) => t.name === "restart_device")!.role).toBe("Fixer");
    expect(TOOLS.find((t) => t.name === "offer_loan")!.role).toBe("Seller");
    expect(TOOLS.find((t) => t.name === "compliance_check")!.role).toBe("Compliance");
    expect(TOOLS.find((t) => t.name === "request_human_approval")!.role).toBe("Manager");
  });
});

describe("get_briefing", () => {
  it("reports Ravi's yesterday, offline Soundbox, Suresh's udhaar and a loan hint", () => {
    const { ctx, events } = setup();
    const out = runToolByName("get_briefing", {}, ctx);
    expect(out.ok).toBe(true);
    const b = out.result as any;
    expect(b.yesterday.total).toBe(14200);
    const sb = b.devices.find((d: any) => d.device_id === "SB-7F42");
    expect(sb.status).toBe("offline");
    expect(sb.issue).toMatchObject({ offline_since_ist: "18:02", unconfirmed_payments: 7, unconfirmed_amount: 1340 });
    expect(b.udhaar_overdue[0]).toMatchObject({ customer_id: "c-suresh", name: "Suresh", amount: 2300, days_outstanding: 12 });
    expect(b.loan_hint).toMatchObject({ eligible: true, amount: 50000 });
    expect(b.loan_hint.reason).toMatch(/Diwali/);
    expect(b.suggested_actions).toEqual([{ tool: "restart_device", args: { device_id: "SB-7F42" }, why: expect.stringContaining("offline") }]);
    const logged = events.find((e) => e.type === "action");
    expect(logged && logged.type === "action" && logged.entry.actor).toBe("Diagnoser");
    expect(logged && logged.type === "action" && logged.entry.summary).toMatch(/Briefing: yesterday Rs 14,200; SB-7F42 offline; Suresh owes Rs 2,300 \(12 days\)/);
  });

  it("reports Lakshmi's failed settlement with a retry suggestion", () => {
    const { ctx } = setup(LAKSHMI_ID);
    const b = runToolByName("get_briefing", {}, ctx).result as any;
    expect(b.failed_settlements).toHaveLength(1);
    expect(b.failed_settlements[0].amount).toBe(8450);
    expect(b.suggested_actions[0].tool).toBe("retry_settlement");
    expect(b.loan_hint.reason).toMatch(/Deepavali/);
  });
});

describe("restart_device and retry_settlement (Fixer)", () => {
  it("brings the Soundbox online, confirms the missed payments and ticks recovered", () => {
    const { ctx, store } = setup();
    expect(store.counters(RAVI_ID).recovered).toBe(0);
    const out = runToolByName("restart_device", { device_id: "SB-7F42" }, ctx);
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ status: "online", confirmed_payments: 7, confirmed_amount: 1340 });
    expect(out.entry.actor).toBe("Fixer");
    expect(store.counters(RAVI_ID).recovered).toBe(1340);
    // A second restart does not double count.
    runToolByName("restart_device", { device_id: "SB-7F42" }, ctx);
    expect(store.counters(RAVI_ID).recovered).toBe(1340);
    const b = runToolByName("get_briefing", {}, ctx).result as any;
    expect(b.devices.find((d: any) => d.device_id === "SB-7F42").issue).toBeUndefined();
  });

  it("fails cleanly for an unknown device", () => {
    const { ctx } = setup();
    const out = runToolByName("restart_device", { device_id: "SB-NOPE" }, ctx);
    expect(out.ok).toBe(false);
    expect(out.result).toMatchObject({ error: "NotFoundError" });
  });

  it("retries Lakshmi's failed settlement and ticks recovered", () => {
    const { ctx, store } = setup(LAKSHMI_ID);
    const id = store.get(LAKSHMI_ID).settlements.find((s) => s.status === "failed")!.id;
    const out = runToolByName("retry_settlement", { settlement_id: id }, ctx);
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ status: "settled", amount: 8450 });
    expect(store.counters(LAKSHMI_ID).recovered).toBe(8450);
  });
});

describe("compliance gate on send_reminder", () => {
  it("refuses send_reminder before compliance_check", () => {
    const { ctx } = setup();
    const out = runToolByName("send_reminder", { customer_id: "c-suresh" }, ctx);
    expect(out.ok).toBe(false);
    expect(out.result).toMatchObject({ error: "COMPLIANCE_REQUIRED" });
  });

  it("sends after a passing compliance_check, publishes the WhatsApp mock and consumes the ticket", () => {
    const { ctx, events, store } = setup();
    const c = runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-suresh" }, ctx);
    expect(c.ok).toBe(true);
    expect(c.entry.actor).toBe("Compliance");
    const ticket = (c.result as ComplianceResult).ticketId!;
    expect(ticket).toMatch(/^CMP-REM-/);
    const out = runToolByName("send_reminder", { customer_id: "c-suresh", compliance_ticket: ticket }, ctx);
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ channel: "whatsapp", to: "Suresh", amount: 2300 });
    expect((out.result as any).message).toMatch(/सुरेश|Suresh/);
    expect((out.result as any).message).toContain("upi://pay");
    const wa = events.find((e) => e.type === "whatsapp");
    expect(wa && wa.type === "whatsapp" && wa.toName).toBe("Suresh");
    expect(store.get(RAVI_ID).udhaar.find((u) => u.customerId === "c-suresh")!.status).toBe("reminded");
    // Ticket is single use.
    const again = runToolByName("send_reminder", { customer_id: "c-suresh" }, ctx);
    expect(again.ok).toBe(false);
  });

  it("refuses to issue a ticket at night, so send_reminder stays blocked", () => {
    const { ctx } = setup(RAVI_ID, "2026-10-31T22:30:00+05:30");
    const c = runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-suresh" }, ctx);
    expect(c.ok).toBe(false);
    expect((c.result as ComplianceResult).allowed).toBe(false);
    expect(c.entry.summary).toMatch(/REFUSED/);
    const out = runToolByName("send_reminder", { customer_id: "c-suresh" }, ctx);
    expect(out.ok).toBe(false);
  });

  it("writes the reminder in Kannada for a Kannada merchant", () => {
    const { ctx } = setup(LAKSHMI_ID);
    runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-manjunath" }, ctx);
    const out = runToolByName("send_reminder", { customer_id: "c-manjunath" }, ctx);
    expect((out.result as any).message).toMatch(/ನಮಸ್ಕಾರ/);
  });
});

describe("loan flow (Seller, Compliance, Manager)", () => {
  it("check_loan_eligibility gives Ravi 50,000 with the Diwali reason", () => {
    const { ctx } = setup();
    const out = runToolByName("check_loan_eligibility", {}, ctx);
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ eligible: true, max_amount: 50000, tenure_months: 6, annual_rate_pct: 18, festival_date: "2026-11-08", days_to_festival: 8 });
    expect(out.entry.actor).toBe("Seller");
  });

  it("offer_loan refuses without consent, without a ticket, and over the limit", () => {
    const { ctx } = setup();
    expect(runToolByName("offer_loan", { amount: 50000, merchant_consented: false }, ctx).result).toMatchObject({ error: "CONSENT_REQUIRED" });
    expect(runToolByName("offer_loan", { amount: 50000, merchant_consented: true }, ctx).result).toMatchObject({ error: "COMPLIANCE_REQUIRED" });
    runToolByName("compliance_check", { action: "offer_loan", merchant_consented: true }, ctx);
    expect(runToolByName("offer_loan", { amount: 90000, merchant_consented: true }, ctx).result).toMatchObject({ error: "OVER_LIMIT" });
  });

  it("offer_loan records the offer, raises human approval, ticks offered, and approval flips status", () => {
    const { ctx, store, events } = setup();
    const c = runToolByName("compliance_check", { action: "offer_loan", merchant_consented: true }, ctx);
    expect(c.ok).toBe(true);
    const out = runToolByName("offer_loan", { amount: 50000, merchant_consented: true, compliance_ticket: (c.result as ComplianceResult).ticketId }, ctx);
    expect(out.ok).toBe(true);
    expect(out.result).toMatchObject({ status: "awaiting_human_approval", amount: 50000 });
    const approvalId = (out.result as any).approval_id as string;
    expect(approvalId).toMatch(/^APR-/);
    const actors = events.filter((e) => e.type === "action").map((e) => (e as any).entry.actor);
    expect(actors).toEqual(["Compliance", "Manager", "Seller"]);
    expect(store.counters(RAVI_ID).offered).toBe(50000);
    expect(store.approvalsFor(RAVI_ID)[0]!.status).toBe("pending");
    store.decideApproval(approvalId, "approved");
    expect(store.get(RAVI_ID).loanOffers[0]!.status).toBe("approved");
  });

  it("the compliance_check for a loan refuses before consent", () => {
    const { ctx } = setup();
    const c = runToolByName("compliance_check", { action: "offer_loan" }, ctx);
    expect(c.ok).toBe(false);
    expect((c.result as ComplianceResult).refusalReason).toMatch(/consent/i);
  });
});

describe("counters", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => {
    s = setup();
  });
  it("collected ticks only when a reminded customer pays", () => {
    s.store.markUdhaarPaid(RAVI_ID, "c-imran");
    expect(s.store.counters(RAVI_ID).collected).toBe(0);
    runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-suresh" }, s.ctx);
    runToolByName("send_reminder", { customer_id: "c-suresh" }, s.ctx);
    s.store.markUdhaarPaid(RAVI_ID, "c-suresh");
    expect(s.store.counters(RAVI_ID).collected).toBe(2300);
  });
});
