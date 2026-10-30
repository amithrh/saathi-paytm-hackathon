import { describe, expect, it } from "vitest";
import type { ServerEvent } from "../../shared/types.js";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import { runToolByName, type ToolContext } from "../../backend/src/tools.js";
import { customerPhonesFromEnv, FakeWhatsAppSender, normalizeWhatsAppAddress, TwilioWhatsAppSender, whatsappSenderFromEnv } from "../src/client.js";

describe("TwilioWhatsAppSender", () => {
  it("posts to Messages.json with whatsapp: addresses and basic auth", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), init: init! };
      return new Response(JSON.stringify({ sid: "SM123", status: "queued" }), { status: 201 });
    }) as typeof fetch;
    const s = new TwilioWhatsAppSender({ accountSid: "ACx", authToken: "tok", from: "whatsapp:+14155238886" }, fakeFetch);
    const r = await s.send("+91 98860 11201", "नमस्ते");
    expect(r).toEqual({ sid: "SM123", status: "queued" });
    expect(seen!.url).toBe("https://api.twilio.com/2010-04-01/Accounts/ACx/Messages.json");
    const body = seen!.init.body as URLSearchParams;
    expect(body.get("From")).toBe("whatsapp:+14155238886");
    expect(body.get("To")).toBe("whatsapp:+919886011201");
    expect(body.get("Body")).toBe("नमस्ते");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("ACx:tok").toString("base64")}`);
  });
  it("surfaces Twilio errors with the code", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ message: "not in sandbox", code: 63015 }), { status: 400 })) as typeof fetch;
    const s = new TwilioWhatsAppSender({ accountSid: "AC", authToken: "t", from: "+1" }, fakeFetch);
    await expect(s.send("+91", "x")).rejects.toThrow(/not in sandbox \(code 63015\)/);
  });
  it("normalises addresses", () => {
    expect(normalizeWhatsAppAddress("whatsapp:+1 (415) 523-8886")).toBe("whatsapp:+14155238886");
  });
  it("builds from env only when all three fields are set", () => {
    expect(whatsappSenderFromEnv({ TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b" })).toBeUndefined();
    expect(whatsappSenderFromEnv({ TWILIO_ACCOUNT_SID: "a", TWILIO_AUTH_TOKEN: "b", TWILIO_WHATSAPP_FROM: "whatsapp:+1" })).toBeInstanceOf(TwilioWhatsAppSender);
    expect(customerPhonesFromEnv({ SURESH_PHONE_NUMBER: "+919900000000" })).toEqual({ "c-suresh": "+919900000000" });
    expect(customerPhonesFromEnv({})).toEqual({});
  });
});

describe("send_reminder delivery modes", () => {
  function setup(extra: Partial<ToolContext>) {
    const clock = fixedClock("2026-10-31T10:15:00+05:30");
    const store = MerchantStore.seeded(clock);
    const bus = new EventBus();
    const events: ServerEvent[] = [];
    bus.subscribe((e) => events.push(e));
    const ctx: ToolContext = { store, clock, merchantId: RAVI_ID, bus, ...extra };
    return { ctx, events, store };
  }
  const whatsappEvent = (events: ServerEvent[]) => events.find((e) => e.type === "whatsapp") as Extract<ServerEvent, { type: "whatsapp" }>;

  it("stays mock when no sender is configured", async () => {
    const { ctx, events } = setup({});
    await runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-suresh" }, ctx);
    const out = await runToolByName("send_reminder", { customer_id: "c-suresh" }, ctx);
    expect(out.ok).toBe(true);
    expect((out.result as { delivery: string }).delivery).toMatch(/^mocked/);
    expect(whatsappEvent(events).delivery.mode).toBe("mock");
    expect(whatsappEvent(events).to).toBe("+91 98860 11201"); // seeded number
  });

  it("stays mock for a customer with no real phone even when the sender exists", async () => {
    const sender = new FakeWhatsAppSender();
    const { ctx, events } = setup({ whatsapp: sender, customerPhones: { "c-suresh": "+919900000000" } });
    await runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-imran" }, ctx);
    await runToolByName("send_reminder", { customer_id: "c-imran" }, ctx);
    expect(sender.sent).toHaveLength(0);
    expect(whatsappEvent(events).delivery.mode).toBe("mock");
  });

  it("sends live to the real number, keeps the UPI link, reports the SID", async () => {
    const sender = new FakeWhatsAppSender();
    const { ctx, events, store } = setup({ whatsapp: sender, customerPhones: { "c-suresh": "+919900000000" } });
    await runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-suresh" }, ctx);
    const out = await runToolByName("send_reminder", { customer_id: "c-suresh" }, ctx);
    expect(out.ok).toBe(true);
    expect(sender.sent).toEqual([{ to: "+919900000000", body: expect.stringContaining("upi://pay?pa=ptm-jay-00117@paytm") }]);
    expect(sender.sent[0]!.body).toContain("₹2,300");
    expect((out.result as { delivery: string }).delivery).toBe("sent via fake WhatsApp, message SMfake1 (queued)");
    expect(out.entry.summary).toMatch(/sent via fake WhatsApp, message SMfake1/);
    const ev = whatsappEvent(events);
    expect(ev.delivery).toEqual({ mode: "live", provider: "fake WhatsApp", sid: "SMfake1", status: "queued" });
    expect(ev.to).toBe("+919900000000");
    expect(store.get(RAVI_ID).udhaar.find((u) => u.customerId === "c-suresh")!.status).toBe("reminded");
  });

  it("falls back to the dashboard when the live send fails, and says so", async () => {
    const sender = new FakeWhatsAppSender("Twilio WhatsApp 400: not in sandbox (code 63015)");
    const { ctx, events } = setup({ whatsapp: sender, customerPhones: { "c-suresh": "+919900000000" } });
    await runToolByName("compliance_check", { action: "send_reminder", customer_id: "c-suresh" }, ctx);
    const out = await runToolByName("send_reminder", { customer_id: "c-suresh" }, ctx);
    expect(out.ok).toBe(false);
    expect((out.result as { delivery: string }).delivery).toMatch(/live send failed .*63015.*dashboard only/);
    expect(whatsappEvent(events).delivery).toMatchObject({ mode: "failed", provider: "fake WhatsApp" });
  });
});
