import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatClient } from "../agent/src/llm.js";
import type { Clock } from "../backend/src/clock.js";
import { EventBus, matchesMerchant } from "../backend/src/events.js";
import { registerBackendRoutes } from "../backend/src/http.js";
import { MerchantStore } from "../backend/src/store.js";
import type { ServerEvent } from "../shared/types.js";
import { registerTwilioRoutes } from "../twilio/src/routes.js";
import { isTrustedControl, registerDemoRoutes } from "./demo.js";
import { FleetMonitor } from "../backend/src/fleet.js";
import type { Dialer } from "../backend/src/bringdown.js";
import { attachBrowserTransport } from "../voice/src/browser-transport.js";
import { CallSession, type CallEvent } from "../voice/src/pipeline.js";
import type { SpeechClient } from "../voice/src/speech.js";
import type { WhatsAppSender } from "../whatsapp/src/client.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface AppDeps {
  clock: Clock;
  store: MerchantStore;
  bus: EventBus;
  llm: ChatClient;
  /** Per-call brain; defaults to `llm`. The offline mode uses this to pick the merchant's scripted scene. */
  llmFor?: (merchantId: string) => ChatClient;
  speech: SpeechClient;
  /** Rings the merchant; buildApp wires it to the Twilio path. Tests pass a fake. */
  dialer?: Dialer;
  /** Fleet tiles and scene state; created by buildApp if absent. */
  monitor?: FleetMonitor;
  /** ms after a reminder before the mock customer pays; 0 disables. */
  simulatedPaymentDelayMs: number;
  whatsapp?: WhatsAppSender;
  customerPhones?: Record<string, string>;
  publicBaseUrl?: string;
  log?: (line: string) => void;
}

export function makeSessionFactory(deps: AppDeps, transport: string) {
  return (merchantId: string, onEvent: (e: CallEvent) => void): CallSession =>
    new CallSession({ merchantId, store: deps.store, clock: deps.clock, llm: deps.llmFor ? deps.llmFor(merchantId) : deps.llm, speech: deps.speech, bus: deps.bus, transport, onEvent, ...(deps.whatsapp ? { whatsapp: deps.whatsapp } : {}), ...(deps.customerPhones ? { customerPhones: deps.customerPhones } : {}), ...(deps.log ? { log: deps.log } : {}) });
}

/** Wires the mock customer who pays after a reminder, and snapshot/counter pushes on store changes. */
export function wireSimulations(deps: AppDeps): void {
  const { store, bus, clock } = deps;
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  store.onChange((merchantId) => {
    pending.add(merchantId);
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      const ids = pending;
      pending = new Set();
      for (const id of ids) {
        bus.publish({ type: "merchant", merchantId: id, snapshot: store.snapshot(id) });
        bus.publish({ type: "counters", merchantId: id, counters: store.weekCounters(id) });
      }
    }, 50);
  });
  if (deps.simulatedPaymentDelayMs > 0) {
    bus.subscribe((e) => {
      if (e.type !== "whatsapp" || e.delivery.mode === "live") return;
      const merchant = store.get(e.merchantId);
      const u = merchant.udhaar.find((x) => x.customerName === e.toName);
      if (!u) return;
      const generation = store.generation;
      setTimeout(() => {
        if (store.generation !== generation) return; // the scene was reset meanwhile
        if (u.status === "paid") return;
        store.markUdhaarPaid(e.merchantId, u.customerId);
        bus.publish({
          type: "action",
          entry: { id: `S-${u.customerId}-${Date.now()}`, at: clock.now().toISOString(), merchantId: e.merchantId, actor: "System", tool: "upi_payment_received", args: { customer: u.customerName }, ok: true, summary: `${u.customerName} paid Rs ${u.amount.toLocaleString("en-IN")} through the UPI link (simulated customer)`, ms: 0 },
        });
      }, deps.simulatedPaymentDelayMs);
    });
  }
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  // One shared object, so numbers changed from the dashboard reach every new call's tool context.
  deps.customerPhones ??= {};
  deps.monitor ??= new FleetMonitor(deps.store, deps.clock, deps.bus);
  const app = Fastify({ logger: false });
  // Twilio delivers its voice and status webhooks as form POSTs. Without this parser
  // Fastify answers 415 before the route runs and the caller hears "check your URL".
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    } catch (e) {
      done(e as Error);
    }
  });
  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, { root: path.join(ROOT, "dashboard", "public"), prefix: "/dashboard/", decorateReply: true });
  await app.register(fastifyStatic, { root: path.join(ROOT, "voice", "public"), prefix: "/call/", decorateReply: false });

  await registerBackendRoutes(app, { store: deps.store, clock: deps.clock, bus: deps.bus, ...(deps.whatsapp ? { whatsapp: deps.whatsapp } : {}), ...(deps.customerPhones ? { customerPhones: deps.customerPhones } : {}) });
  const twilio = await registerTwilioRoutes(app, { authorize: (req) => isTrustedControl(req, process.env), makeSession: makeSessionFactory(deps, "phone"), ...(deps.publicBaseUrl ? { publicBaseUrl: deps.publicBaseUrl } : {}), ...(deps.log ? { log: deps.log } : {}) });
  deps.dialer ??= async (merchantId, to) => {
    const r = await twilio.dial(merchantId, to);
    return r.ok ? { ok: true, callSid: r.callSid, status: r.status } : { ok: false, error: r.error };
  };
  await registerDemoRoutes(app, deps);

  const callHtml = () => readFileSync(path.join(ROOT, "voice", "public", "call.html"), "utf8");
  const dashHtml = () => readFileSync(path.join(ROOT, "dashboard", "public", "index.html"), "utf8");
  app.get("/", async (_req, reply) => reply.type("text/html").send(indexHtml()));
  app.get("/call", async (_req, reply) => reply.type("text/html").send(callHtml()));
  app.get("/dashboard", async (_req, reply) => reply.type("text/html").send(dashHtml()));
  app.get("/fleet", async (_req, reply) => reply.type("text/html").send(readFileSync(path.join(ROOT, "dashboard", "public", "fleet.html"), "utf8")));

  // Polling twin of /events for clients behind proxies that buffer streams (tunnels, venue Wi-Fi).
  app.get<{ Params: { id: string }; Querystring: { since?: string } }>("/api/merchants/:id/events", async (req) => {
    const after = Number(req.query.since ?? 0);
    return deps.bus.since(Number.isFinite(after) ? after : 0, req.params.id);
  });

  app.get<{ Querystring: { merchant?: string } }>("/events", (req, reply) => {
    const merchantId = req.query.merchant;
    // no-transform and the 2 KB padding comment stop proxies (Cloudflare tunnel, nginx) from
    // buffering the stream; without them the dashboard stays empty behind a tunnel.
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no", "Access-Control-Allow-Origin": "*" });
    reply.raw.write(`: ${" ".repeat(2048)}\n\n`);
    const write = (e: ServerEvent, seq?: number) => reply.raw.write(`data: ${JSON.stringify(seq === undefined ? e : { ...e, seq })}\n\n`);
    if (merchantId) {
      try {
        write({ type: "merchant", merchantId, snapshot: deps.store.snapshot(merchantId) });
      } catch {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: "unknown merchant" })}\n\n`);
      }
    }
    for (const e of deps.bus.since(0, merchantId).events) if (e.type !== "merchant" && e.type !== "counters") write(e, e.seq);
    const unsubscribe = deps.bus.subscribe((e, seq) => {
      if (matchesMerchant(e, merchantId)) write(e, seq);
    });
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  app.get("/ws/call", { websocket: true }, (socket) => {
    attachBrowserTransport(socket, { makeSession: makeSessionFactory(deps, "browser"), ...(deps.log ? { log: deps.log } : {}) });
  });

  return app;
}

function indexHtml(): string {
  return `<!doctype html><meta charset="utf-8"><title>Saathi demo</title>
<style>body{font-family:system-ui;max-width:640px;margin:60px auto;padding:0 20px;color:#102a56}a{display:block;font-size:22px;padding:16px;margin:12px 0;background:#eaf6ff;border-radius:12px;color:#0b4fb3;text-decoration:none}a:hover{background:#d6edff}</style>
<h1>Saathi demo</h1>
<p>Open the dashboard on the projector and the call screen on the laptop.</p>
<a href="/dashboard?merchant=m001">Dashboard: Ravi Kirana Store (Hindi)</a>
<a href="/call?merchant=m001">Call screen: Ravi (Hindi)</a>
<a href="/dashboard?merchant=m002">Dashboard: Lakshmi Provision Stores (Kannada)</a>
<a href="/call?merchant=m002">Call screen: Lakshmi (Kannada)</a>
<a href="/api/health">API health</a>`;
}

export { EventBus, MerchantStore };
