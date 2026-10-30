import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatClient } from "../agent/src/llm.js";
import type { Clock } from "../backend/src/clock.js";
import { EventBus } from "../backend/src/events.js";
import { registerBackendRoutes } from "../backend/src/http.js";
import { MerchantStore } from "../backend/src/store.js";
import type { ServerEvent } from "../shared/types.js";
import { registerTwilioRoutes } from "../twilio/src/routes.js";
import { attachBrowserTransport } from "../voice/src/browser-transport.js";
import { CallSession, type CallEvent } from "../voice/src/pipeline.js";
import type { SpeechClient } from "../voice/src/speech.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface AppDeps {
  clock: Clock;
  store: MerchantStore;
  bus: EventBus;
  llm: ChatClient;
  speech: SpeechClient;
  /** ms after a reminder before the mock customer pays; 0 disables. */
  simulatedPaymentDelayMs: number;
  publicBaseUrl?: string;
  log?: (line: string) => void;
}

export function makeSessionFactory(deps: AppDeps, transport: string) {
  return (merchantId: string, onEvent: (e: CallEvent) => void): CallSession =>
    new CallSession({ merchantId, store: deps.store, clock: deps.clock, llm: deps.llm, speech: deps.speech, bus: deps.bus, transport, onEvent, ...(deps.log ? { log: deps.log } : {}) });
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
        bus.publish({ type: "counters", merchantId: id, counters: store.counters(id) });
      }
    }, 50);
  });
  if (deps.simulatedPaymentDelayMs > 0) {
    bus.subscribe((e) => {
      if (e.type !== "whatsapp") return;
      const merchant = store.get(e.merchantId);
      const u = merchant.udhaar.find((x) => x.customerName === e.toName);
      if (!u) return;
      setTimeout(() => {
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
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, { root: path.join(ROOT, "dashboard", "public"), prefix: "/dashboard/", decorateReply: true });
  await app.register(fastifyStatic, { root: path.join(ROOT, "voice", "public"), prefix: "/call/", decorateReply: false });

  await registerBackendRoutes(app, { store: deps.store, clock: deps.clock, bus: deps.bus });
  await registerTwilioRoutes(app, { makeSession: makeSessionFactory(deps, "twilio"), ...(deps.publicBaseUrl ? { publicBaseUrl: deps.publicBaseUrl } : {}), ...(deps.log ? { log: deps.log } : {}) });

  const callHtml = () => readFileSync(path.join(ROOT, "voice", "public", "call.html"), "utf8");
  const dashHtml = () => readFileSync(path.join(ROOT, "dashboard", "public", "index.html"), "utf8");
  app.get("/", async (_req, reply) => reply.type("text/html").send(indexHtml()));
  app.get("/call", async (_req, reply) => reply.type("text/html").send(callHtml()));
  app.get("/dashboard", async (_req, reply) => reply.type("text/html").send(dashHtml()));

  app.get<{ Querystring: { merchant?: string } }>("/events", (req, reply) => {
    const merchantId = req.query.merchant;
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" });
    const write = (e: ServerEvent) => reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
    if (merchantId) {
      try {
        write({ type: "merchant", merchantId, snapshot: deps.store.snapshot(merchantId) });
      } catch {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: "unknown merchant" })}\n\n`);
      }
    }
    for (const e of deps.bus.recent(merchantId)) if (e.type !== "merchant" && e.type !== "counters") write(e);
    const unsubscribe = deps.bus.subscribe((e) => {
      if (!merchantId) return write(e);
      if (e.type === "approval" ? e.approval.merchantId === merchantId : e.type === "action" ? e.entry.merchantId === merchantId : e.merchantId === merchantId) write(e);
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
