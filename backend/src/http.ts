import type { FastifyInstance } from "fastify";
import type { Clock } from "./clock.js";
import type { EventBus } from "./events.js";
import { MerchantStore, NotFoundError } from "./store.js";
import { runToolByName, TOOLS } from "./tools.js";

export interface BackendDeps {
  store: MerchantStore;
  clock: Clock;
  bus: EventBus;
}

/**
 * Tool-style HTTP API over the mock backend.
 * The agent calls tools in-process for latency; this surface exists so the same tools
 * can be driven from curl, tests, or a separately hosted agent.
 */
export async function registerBackendRoutes(app: FastifyInstance, deps: BackendDeps): Promise<void> {
  const { store, clock, bus } = deps;

  app.get("/api/health", async () => ({ ok: true, clockIst: store.snapshot("m001").clockIst, merchants: store.list().length }));

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
    const out = runToolByName(req.params.name, req.body?.args ?? {}, { store, clock, merchantId, bus, ...(req.body?.call_id ? { callId: req.body.call_id } : {}) });
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
