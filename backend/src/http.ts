import type { FastifyInstance } from "fastify";
import type { Clock } from "./clock.js";
import type { EventBus } from "./events.js";
import { MerchantStore, NotFoundError } from "./store.js";
import { runToolByName, TOOLS } from "./tools.js";
import { LLM_PROHIBITIONS, TRIGGER_RULES } from "./policy.js";
import { CALLING_HOURS, COOLING_OFF_DAYS, HUMAN_APPROVAL_ABOVE } from "./compliance.js";
import type { WhatsAppSender } from "../../whatsapp/src/client.js";

export interface BackendDeps {
  store: MerchantStore;
  clock: Clock;
  bus: EventBus;
  whatsapp?: WhatsAppSender;
  customerPhones?: Record<string, string>;
}

/**
 * Tool-style HTTP API over the mock backend.
 * The agent calls tools in-process for latency; this surface exists so the same tools
 * can be driven from curl, tests, or a separately hosted agent.
 */
export async function registerBackendRoutes(app: FastifyInstance, deps: BackendDeps): Promise<void> {
  const { store, clock, bus, whatsapp, customerPhones } = deps;

  app.get("/api/health", async () => ({ ok: true, clockIst: store.snapshot("m001").clockIst, merchants: store.list().length }));

  app.get("/api/policy", async () => ({
    prohibitions: LLM_PROHIBITIONS,
    triggers: TRIGGER_RULES,
    callingWindowIst: `${CALLING_HOURS.start}:00-${CALLING_HOURS.end}:00`,
    humanApprovalAbove: HUMAN_APPROVAL_ABOVE,
    coolingOffDays: COOLING_OFF_DAYS,
  }));

  app.post<{ Params: { id: string } }>("/api/loans/:id/handoff", async (req, reply) => {
    try {
      const o = store.handoffLoan(req.params.id);
      const m = store.list().find((x) => x.loanOffers.includes(o))!;
      bus.publish({
        type: "action",
        entry: { id: `H-${o.id}`, at: clock.now().toISOString(), merchantId: m.id, actor: "Human", tool: "disburse", args: { offer_id: o.id }, ok: true, summary: `Human handed loan ${o.id} of Rs ${o.amount.toLocaleString("en-IN")} to ${o.lender}; no funds move in this demo`, source: "human button; the agent has no tool for this", ms: 0 },
      });
      return o;
    } catch (e) {
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      return reply.code(409).send({ error: (e as Error).message });
    }
  });

  app.get("/api/tools", async () => TOOLS.map((t) => ({ name: t.name, role: t.role, description: t.description, parameters: t.parameters })));

  app.get("/api/merchants", async () =>
    store.list().map((m) => ({ id: m.id, ownerName: m.ownerName, shopName: m.shopName, area: m.area, language: m.language, category: m.category })),
  );

  app.get<{ Params: { id: string } }>("/api/merchants/:id/snapshot", async (req, reply) => {
    try {
      return store.snapshot(req.params.id);
    } catch (e) {
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      throw e;
    }
  });

  app.post<{ Params: { name: string }; Body: { merchant_id?: string; call_id?: string; args?: Record<string, unknown> } }>("/api/tools/:name", async (req, reply) => {
    const merchantId = req.body?.merchant_id;
    if (!merchantId) return reply.code(400).send({ error: "merchant_id is required" });
    try {
      store.get(merchantId);
    } catch {
      return reply.code(404).send({ error: `merchant ${merchantId} not found` });
    }
    const out = await runToolByName(req.params.name, req.body?.args ?? {}, { store, clock, merchantId, bus, ...(whatsapp ? { whatsapp } : {}), ...(customerPhones ? { customerPhones } : {}), ...(req.body?.call_id ? { callId: req.body.call_id } : {}) });
    return reply.code(out.ok ? 200 : 422).send({ ok: out.ok, actor: out.entry.actor, summary: out.entry.summary, result: out.result, ms: out.entry.ms });
  });

  app.post<{ Params: { id: string; decision: "approved" | "rejected" } }>("/api/approvals/:id/:decision", async (req, reply) => {
    const { id, decision } = req.params;
    if (decision !== "approved" && decision !== "rejected") return reply.code(400).send({ error: "decision must be approved or rejected" });
    try {
      const a = store.decideApproval(id, decision);
      bus.publish({ type: "approval", approval: a });
      bus.publish({
        type: "action",
        entry: { id: `H-${id}`, at: clock.now().toISOString(), merchantId: a.merchantId, actor: "Human", tool: "approve", args: { approval_id: id }, ok: decision === "approved", summary: `Human ${decision} ${a.action}${a.amount ? ` of Rs ${a.amount.toLocaleString("en-IN")}` : ""} (${id})`, ms: 0 },
      });
      return a;
    } catch (e) {
      if (e instanceof NotFoundError) return reply.code(404).send({ error: e.message });
      throw e;
    }
  });
}
