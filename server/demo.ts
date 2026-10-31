import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppDeps } from "./app.js";

/** Which customer gets the live reminder in each demo scene. */
export const SCENE_CUSTOMER: Record<string, { customerId: string; name: string; envKey: string }> = {
  m001: { customerId: "c-suresh", name: "Suresh", envKey: "SURESH_PHONE_NUMBER" },
  m002: { customerId: "c-manjunath", name: "Manjunath", envKey: "MANJUNATH_PHONE_NUMBER" },
};

export const SANDBOX_JOIN_HINT = 'The phone must first send "join plenty-drive" to +1 415 523 8886 on WhatsApp (valid 72 h).';

export const TEST_WHATSAPP_TEXT = "साथी टेस्ट संदेश: यह नंबर आज के डेमो में उधार रिमाइंडर पाएगा। धन्यवाद 🙏";

/**
 * Controls that ring phones or send WhatsApp spend money and reach real people, and the dashboard is
 * also reachable through the public tunnel. Allowed from the laptop itself (loopback, no proxy headers),
 * or through the tunnel only with DEMO_CONTROL_KEY.
 */
export function isTrustedControl(req: FastifyRequest, env: NodeJS.ProcessEnv): boolean {
  const h = req.headers;
  const proxied = Boolean(h["cf-connecting-ip"] || h["cf-ray"] || h["x-forwarded-for"] || h["x-real-ip"]);
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip);
  if (loopback && !proxied) return true;
  const key = env.DEMO_CONTROL_KEY?.trim();
  if (!key) return false;
  const given = String(h["x-demo-key"] ?? (req.query as Record<string, string> | undefined)?.key ?? "");
  return given === key;
}

export const normalisePhone = (s: string) => s.replace(/[\s()-]/g, "");
export const isE164 = (s: string) => /^\+\d{8,15}$/.test(s);

export async function registerDemoRoutes(app: FastifyInstance, deps: AppDeps, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const phones = deps.customerPhones!;
  const deny = { error: "demo controls are local-only; open the dashboard on the laptop or add ?key=<DEMO_CONTROL_KEY>" };

  app.get<{ Querystring: { merchant?: string } }>("/api/demo/config", async (req) => {
    if (!isTrustedControl(req, env)) return { controls: false };
    const scene = SCENE_CUSTOMER[req.query.merchant ?? "m001"];
    return {
      controls: true,
      demoPhone: env.DEMO_PHONE_NUMBER?.trim() ?? "",
      customer: scene ? { id: scene.customerId, name: scene.name, phone: phones[scene.customerId] ?? "" } : null,
      whatsappLive: Boolean(deps.whatsapp),
      twilioConfigured: Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER),
      joinHint: SANDBOX_JOIN_HINT,
    };
  });

  /** Swap the customer's real WhatsApp number for this scene; send_reminder uses it from the next send. */
  app.post<{ Body: { merchantId?: string; phone?: string } }>("/api/demo/customer-phone", async (req, reply) => {
    if (!isTrustedControl(req, env)) return reply.code(403).send(deny);
    const scene = SCENE_CUSTOMER[req.body?.merchantId ?? "m001"];
    if (!scene) return reply.code(400).send({ error: "unknown merchant" });
    const phone = normalisePhone(req.body?.phone ?? "");
    if (phone === "") {
      delete phones[scene.customerId];
      return { ok: true, customer: scene.name, phone: "", note: "reminder for this customer is mock now" };
    }
    if (!isE164(phone)) return reply.code(400).send({ error: `not an international number: ${phone} (use +91...)` });
    phones[scene.customerId] = phone;
    deps.log?.(`demo: ${scene.name}'s WhatsApp number changed from the dashboard`);
    return { ok: true, customer: scene.name, phone };
  });

  app.post<{ Body: { to?: string } }>("/api/demo/whatsapp-test", async (req, reply) => {
    if (!isTrustedControl(req, env)) return reply.code(403).send(deny);
    if (!deps.whatsapp) return reply.code(503).send({ error: "WhatsApp is not configured (TWILIO_WHATSAPP_FROM in .env)" });
    const to = normalisePhone(req.body?.to ?? "");
    if (!isE164(to)) return reply.code(400).send({ error: `not an international number: ${to || "(empty)"}` });
    try {
      const r = await deps.whatsapp.send(to, TEST_WHATSAPP_TEXT);
      return { ok: true, sid: r.sid, status: r.status };
    } catch (e) {
      const msg = (e as Error).message;
      return reply.code(502).send({ error: /63015|21654|sandbox/i.test(msg) ? `${msg}. ${SANDBOX_JOIN_HINT}` : msg });
    }
  });

  /** Back to the opening scene: reseeded store, cleared live panels, clock untouched. */
  app.post("/api/demo/reset", async (req, reply) => {
    if (!isTrustedControl(req, env)) return reply.code(403).send(deny);
    deps.store.reset();
    for (const m of deps.store.list()) deps.bus.publish({ type: "reset", merchantId: m.id });
    deps.log?.("demo: scene reset from the dashboard");
    return { ok: true, clockIst: deps.store.snapshot("m001").clockIst, generation: deps.store.generation };
  });
}
