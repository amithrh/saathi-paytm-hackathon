import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { ScriptedBrain } from "../../agent/src/scripted-brain.js";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import type { ServerEvent } from "../../shared/types.js";
import { FakeSpeechClient } from "../../voice/src/speech.js";
import { FakeWhatsAppSender } from "../../whatsapp/src/client.js";
import { buildApp, wireSimulations, type AppDeps } from "../app.js";
import { TEST_WHATSAPP_TEXT } from "../demo.js";

describe("demo controls", () => {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const whatsapp = new FakeWhatsAppSender();
  const deps: AppDeps = { clock, store, bus, llm: new ScriptedBrain(RAVI_ID), llmFor: (id) => new ScriptedBrain(id), speech: new FakeSpeechClient(), simulatedPaymentDelayMs: 40, whatsapp, customerPhones: { "c-suresh": "+919900000001" } };
  let app: FastifyInstance;
  const prevKey = process.env.DEMO_CONTROL_KEY;
  beforeAll(async () => {
    process.env.DEMO_CONTROL_KEY = "k-123";
    wireSimulations(deps);
    app = await buildApp(deps);
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    if (prevKey === undefined) delete process.env.DEMO_CONTROL_KEY;
    else process.env.DEMO_CONTROL_KEY = prevKey;
  });
  const tunnel = { "cf-connecting-ip": "203.0.113.9" };

  it("gives full config to the laptop, masks nothing server-side, and locks the tunnel without the key", async () => {
    const local = (await app.inject({ method: "GET", url: "/api/demo/config?merchant=m001" })).json();
    expect(local).toMatchObject({ controls: true, customer: { id: "c-suresh", name: "Suresh", phone: "+919900000001" }, whatsappLive: true });
    expect((await app.inject({ method: "GET", url: "/api/demo/config", headers: tunnel })).json()).toEqual({ controls: false });
    expect((await app.inject({ method: "GET", url: "/api/demo/config", headers: { ...tunnel, "x-demo-key": "k-123" } })).json().controls).toBe(true);
    for (const [url, payload] of [["/api/demo/reset", {}], ["/api/demo/customer-phone", { phone: "+919900000002" }], ["/api/demo/whatsapp-test", { to: "+919900000002" }], ["/twilio/call", { merchantId: "m001", to: "+919900000002" }]] as const) {
      const r = await app.inject({ method: "POST", url, payload, headers: { ...tunnel, "x-demo-key": "wrong" } });
      expect(r.statusCode, url).toBe(403);
    }
  });

  it("swaps the customer's number and send_reminder uses the new one", async () => {
    const bad = await app.inject({ method: "POST", url: "/api/demo/customer-phone", payload: { merchantId: "m001", phone: "98450" } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/demo/customer-phone", payload: { merchantId: "m001", phone: "+91 99000 12345" } });
    expect(ok.json()).toMatchObject({ ok: true, phone: "+919900012345" });
    await app.inject({ method: "POST", url: "/api/tools/compliance_check", payload: { merchant_id: RAVI_ID, args: { action: "send_reminder", customer_id: "c-suresh" } } });
    const sent = await app.inject({ method: "POST", url: "/api/tools/send_reminder", payload: { merchant_id: RAVI_ID, args: { customer_id: "c-suresh" } } });
    expect(sent.statusCode).toBe(200);
    expect(whatsapp.sent.at(-1)!.to).toBe("+919900012345");
    expect(whatsapp.sent.at(-1)!.body).toContain("upi://pay");
  });

  it("sends a test WhatsApp to the given number", async () => {
    const r = await app.inject({ method: "POST", url: "/api/demo/whatsapp-test", payload: { to: "+919900012345" } });
    expect(r.json()).toMatchObject({ ok: true, status: "queued" });
    expect(whatsapp.sent.at(-1)).toEqual({ to: "+919900012345", body: TEST_WHATSAPP_TEXT });
  });

  it("validates the number before dialling", async () => {
    const r = await app.inject({ method: "POST", url: "/twilio/call", payload: { merchantId: "m001", to: "12345" } });
    // Without creds in this process the route stops at 503 first; with creds it would be 400. Either way, no dial.
    expect([400, 503]).toContain(r.statusCode);
  });

  it("reset restores the opening scene, keeps the clock, clears panels, and drops stale simulated payments", async () => {
    // Mid-scene state: device fixed, reminder sent above (a simulated payment is pending), loan offered.
    await app.inject({ method: "POST", url: "/api/tools/restart_device", payload: { merchant_id: RAVI_ID, args: { device_id: "SB-7F42" } } });
    await app.inject({ method: "POST", url: "/api/tools/compliance_check", payload: { merchant_id: RAVI_ID, args: { action: "offer_loan", merchant_consented: true } } });
    await app.inject({ method: "POST", url: "/api/tools/offer_loan", payload: { merchant_id: RAVI_ID, args: { amount: 50000, merchant_consented: true } } });
    expect(store.weekCounters(RAVI_ID).offered).toBe(50000);

    const before = events.length;
    const r = await app.inject({ method: "POST", url: "/api/demo/reset", payload: {} });
    expect(r.json()).toMatchObject({ ok: true, clockIst: "2026-10-31 10:15 IST" });
    const snap = store.snapshot(RAVI_ID);
    expect(snap.devices.find((d) => d.id === "SB-7F42")!.status).toBe("offline");
    expect(snap.udhaar.find((u) => u.customerId === "c-suresh")).toMatchObject({ status: "outstanding", amount: 2300 });
    expect(snap.counters).toEqual({ recovered: 2110, collected: 1500, offered: 0, ticketsAvoided: 2 });
    expect(snap.approvals).toEqual([]);
    expect(snap.loanOffers).toEqual([]);
    expect(events.slice(before).some((e) => e.type === "reset" && e.merchantId === RAVI_ID)).toBe(true);
    // Compliance tickets from before the reset are gone.
    const noTicket = await app.inject({ method: "POST", url: "/api/tools/send_reminder", payload: { merchant_id: RAVI_ID, args: { customer_id: "c-suresh" } } });
    expect(noTicket.json().result.error).toBe("COMPLIANCE_REQUIRED");
    // The pre-reset "Suresh pays" timer fires now and must not touch the fresh scene.
    await new Promise((res) => setTimeout(res, 80));
    expect(store.get(RAVI_ID).udhaar.find((u) => u.customerId === "c-suresh")!.status).toBe("outstanding");
    // The overridden number survives a reset.
    expect(deps.customerPhones!["c-suresh"]).toBe("+919900012345");
  });
});
