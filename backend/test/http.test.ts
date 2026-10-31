import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixedClock } from "../src/clock.js";
import { EventBus } from "../src/events.js";
import { registerBackendRoutes } from "../src/http.js";
import { RAVI_ID } from "../src/seed.js";
import { MerchantStore } from "../src/store.js";

describe("backend HTTP tool API", () => {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const app = Fastify();
  beforeAll(async () => {
    await registerBackendRoutes(app, { store, clock, bus });
    await app.ready();
  });
  afterAll(() => app.close());

  it("lists tools with roles", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tools" });
    expect(res.statusCode).toBe(200);
    const tools = res.json() as Array<{ name: string; role: string }>;
    expect(tools.find((t) => t.name === "compliance_check")!.role).toBe("Compliance");
  });

  it("runs a tool and gates send_reminder on compliance", async () => {
    const blocked = await app.inject({ method: "POST", url: "/api/tools/send_reminder", payload: { merchant_id: RAVI_ID, args: { customer_id: "c-suresh" } } });
    expect(blocked.statusCode).toBe(422);
    const c = await app.inject({ method: "POST", url: "/api/tools/compliance_check", payload: { merchant_id: RAVI_ID, args: { action: "send_reminder", customer_id: "c-suresh" } } });
    expect(c.statusCode).toBe(200);
    const sent = await app.inject({ method: "POST", url: "/api/tools/send_reminder", payload: { merchant_id: RAVI_ID, args: { customer_id: "c-suresh" } } });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().actor).toBe("Fixer");
  });

  it("returns a snapshot and approves a pending approval", async () => {
    await app.inject({ method: "POST", url: "/api/tools/compliance_check", payload: { merchant_id: RAVI_ID, args: { action: "offer_loan", merchant_consented: true } } });
    const offer = await app.inject({ method: "POST", url: "/api/tools/offer_loan", payload: { merchant_id: RAVI_ID, args: { amount: 50000, merchant_consented: true } } });
    expect(offer.statusCode).toBe(200);
    const approvalId = offer.json().result.approval_id as string;
    const snap = await app.inject({ method: "GET", url: `/api/merchants/${RAVI_ID}/snapshot` });
    expect(snap.json().approvals[0].id).toBe(approvalId);
    expect(snap.json().counters.offered).toBe(50000);
    const ok = await app.inject({ method: "POST", url: `/api/approvals/${approvalId}/approved` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe("approved");
    const missing = await app.inject({ method: "GET", url: "/api/merchants/nope/snapshot" });
    expect(missing.statusCode).toBe(404);
    const offerId = snap.json().loanOffers[0].id as string;
    const handoff = await app.inject({ method: "POST", url: `/api/loans/${offerId}/handoff` });
    expect(handoff.statusCode).toBe(200);
    expect(handoff.json().status).toBe("handed_to_lender");
  });

  it("publishes the policy the dashboard shows", async () => {
    const res = await app.inject({ method: "GET", url: "/api/policy" });
    const p = res.json();
    expect(p.prohibitions.map((x: { rule: string }) => x.rule)).toContain("No arithmetic");
    expect(p.triggers).toHaveLength(3);
    expect(p.callingWindowIst).toBe("9:00-19:00");
  });
});
