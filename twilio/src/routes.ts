import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { CallEvent, CallSession } from "../../voice/src/pipeline.js";
import { attachTwilioMediaStream, connectStreamTwiml } from "./media-stream.js";
import { placeCall, twilioCredentialsFromEnv } from "./rest.js";

export interface TwilioRouteDeps {
  makeSession: (merchantId: string, onEvent: (e: CallEvent) => void) => CallSession;
  publicBaseUrl?: string;
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

interface Prepared {
  session: CallSession;
  merchantId: string;
  setEventSink: (fn: (e: CallEvent) => void) => void;
}

/**
 * Twilio transport: prepare the session before dialling so the briefing is ready when the
 * merchant answers; the <Stream> carries a token that the media WebSocket uses to find it.
 */
export async function registerTwilioRoutes(app: FastifyInstance, deps: TwilioRouteDeps): Promise<void> {
  const env = deps.env ?? process.env;
  const prepared = new Map<string, Prepared>();

  const wsUrlFor = (host: string) => {
    const base = deps.publicBaseUrl ?? `http://${host}`;
    return base.replace(/^http/, "ws").replace(/\/$/, "") + "/twilio/media";
  };

  function prepare(merchantId: string): Prepared {
    let sink: (e: CallEvent) => void = () => undefined;
    const session = deps.makeSession(merchantId, (e) => sink(e));
    const p: Prepared = { session, merchantId, setEventSink: (fn) => (sink = fn) };
    return p;
  }

  app.get("/twilio/status", async () => {
    const creds = twilioCredentialsFromEnv(env);
    return { configured: Boolean(creds), publicBaseUrl: deps.publicBaseUrl ?? null, demoPhoneNumber: env.DEMO_PHONE_NUMBER ? "set" : null, preparedSessions: prepared.size };
  });

  /** Place the outbound call. Body: { merchantId?, to? }. Needs creds and PUBLIC_BASE_URL (ngrok). */
  app.post<{ Body: { merchantId?: string; to?: string } }>("/twilio/call", async (req, reply) => {
    const creds = twilioCredentialsFromEnv(env);
    if (!creds) return reply.code(503).send({ error: "Twilio credentials missing in .env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)" });
    if (!deps.publicBaseUrl) return reply.code(503).send({ error: "PUBLIC_BASE_URL is not set; Twilio must reach this server over HTTPS (ngrok http 3000)" });
    const to = req.body?.to ?? env.DEMO_PHONE_NUMBER;
    if (!to) return reply.code(400).send({ error: "no phone number: pass `to` or set DEMO_PHONE_NUMBER" });
    const merchantId = req.body?.merchantId ?? "m001";
    const token = randomUUID();
    const p = prepare(merchantId);
    prepared.set(token, p);
    try {
      await p.session.prepare();
    } catch (e) {
      prepared.delete(token);
      return reply.code(500).send({ error: `prepare failed: ${(e as Error).message}` });
    }
    const voiceUrl = `${deps.publicBaseUrl.replace(/\/$/, "")}/twilio/voice?token=${token}`;
    try {
      const call = await placeCall(creds, { to, voiceUrl }, deps.fetchImpl);
      deps.log?.(`twilio: dialling ${to} for ${merchantId}, call ${call.callSid}`);
      return { ok: true, callSid: call.callSid, status: call.status, token };
    } catch (e) {
      prepared.delete(token);
      p.session.hangup("dial failed");
      return reply.code(502).send({ error: (e as Error).message });
    }
  });

  /** TwiML webhook. With a token: an outbound call we prepared. Without: an inbound call to the demo merchant. */
  app.all<{ Querystring: { token?: string; merchant?: string } }>("/twilio/voice", async (req, reply) => {
    let token = req.query.token;
    if (!token || !prepared.has(token)) {
      token = randomUUID();
      const p = prepare(req.query.merchant ?? env.DEMO_INBOUND_MERCHANT ?? "m001");
      prepared.set(token, p);
      try {
        await p.session.prepare();
      } catch (e) {
        prepared.delete(token);
        return reply.code(500).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Saathi could not prepare the call.</Say></Response>`);
      }
    }
    return reply.type("text/xml").send(connectStreamTwiml(wsUrlFor(req.headers.host ?? "localhost"), { token }));
  });

  app.get("/twilio/media", { websocket: true }, (socket) => {
    attachTwilioMediaStream(socket, {
      ...(deps.log ? { log: deps.log } : {}),
      resolveSession: async (params, onEvent) => {
        const p = params.token ? prepared.get(params.token) : undefined;
        if (!p) throw new Error(`unknown token ${params.token ?? "(none)"}`);
        prepared.delete(params.token!);
        p.setEventSink(onEvent);
        return p.session;
      },
    });
  });
}
