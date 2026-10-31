import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { CallEvent, CallSession } from "../../voice/src/pipeline.js";
import { attachTwilioMediaStream, connectStreamTwiml } from "./media-stream.js";
import { placeCall, twilioCredentialsFromEnv } from "./rest.js";
import { errorTwiml, joinForPhone, PhoneAudioStore, playThenGatherTwiml, playThenHangupTwiml, REPROMPT } from "./turns.js";

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
  /** Turn-based phone path: consecutive empty SpeechResults. */
  empties: number;
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
    const p: Prepared = { session, merchantId, setEventSink: (fn) => (sink = fn), empties: 0 };
    return p;
  }

  /**
   * Media Streams needs an account tier that allows <Connect><Stream>; the trial tier drops the call.
   * Default is the turn-based path: <Play> Sarvam audio, <Gather input="speech">, POST back, repeat.
   */
  const useMediaStreams = env.TWILIO_MEDIA_STREAMS === "1";
  const audio = new PhoneAudioStore();
  const baseUrl = (host: string | undefined) => (deps.publicBaseUrl ?? `https://${host ?? "localhost"}`).replace(/\/$/, "");

  /** Run fn while capturing the audio chunks the session emits; return one phone WAV URL. */
  async function captureTurn(p: Prepared, host: string | undefined, fn: () => Promise<void>): Promise<string[]> {
    const chunks: Buffer[] = [];
    p.setEventSink((e) => {
      if (e.type === "audio") chunks.push(e.wav);
    });
    await fn();
    p.setEventSink(() => undefined);
    if (!chunks.length) return [];
    return [`${baseUrl(host)}/twilio/audio/${audio.put(joinForPhone(chunks))}.wav`];
  }

  async function lineUrl(p: Prepared, host: string | undefined, text: string): Promise<string> {
    return `${baseUrl(host)}/twilio/audio/${audio.put(joinForPhone([await p.session.speakLine(text)]))}.wav`;
  }

  const gatherUrl = (host: string | undefined, token: string) => `${baseUrl(host)}/twilio/gather?token=${encodeURIComponent(token)}`;

  app.get<{ Params: { file: string } }>("/twilio/audio/:file", async (req, reply) => {
    const wav = audio.get(req.params.file.replace(/\.wav$/, ""));
    if (!wav) return reply.code(404).send({ error: "no such audio" });
    return reply.type("audio/wav").header("Cache-Control", "no-store").send(wav);
  });

  /** One merchant turn on the phone: Twilio's speech recognition in, Sarvam agent and voice out. */
  app.post<{ Querystring: { token?: string }; Body: Record<string, string> | undefined }>("/twilio/gather", async (req, reply) => {
    const token = req.query.token ?? "";
    const p = prepared.get(token);
    reply.type("text/xml");
    if (!p) return reply.send(errorTwiml("Sorry, this call has expired."));
    const host = req.headers.host;
    const said = (req.body?.SpeechResult ?? "").trim();
    deps.log?.(`twilio: gather token=${token.slice(0, 8)} speech="${said}" confidence=${req.body?.Confidence ?? "?"}`);
    try {
      if (!said && p.empties === 0) {
        p.empties++;
        return reply.send(playThenGatherTwiml({ audioUrls: [await lineUrl(p, host, REPROMPT[p.session.language])], actionUrl: gatherUrl(host, token), language: p.session.language }));
      }
      p.empties = 0;
      const urls = await captureTurn(p, host, () => p.session.handleText(said));
      if (p.session.agentEnded) {
        prepared.delete(token);
        return reply.send(playThenHangupTwiml(urls));
      }
      return reply.send(playThenGatherTwiml({ audioUrls: urls, actionUrl: gatherUrl(host, token), language: p.session.language }));
    } catch (e) {
      deps.log?.(`twilio: gather failed: ${(e as Error).message}`);
      return reply.send(errorTwiml("Sorry, Saathi hit a problem. Please try again later."));
    }
  });

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
    deps.log?.(`twilio: voice webhook ${req.method} token=${req.query.token ? "yes" : "none"} from ${req.ip}`);
    let token = req.query.token;
    if (!token || !prepared.has(token)) {
      token = randomUUID();
      const p = prepare(req.query.merchant ?? env.DEMO_INBOUND_MERCHANT ?? "m001");
      prepared.set(token, p);
      try {
        await p.session.prepare();
      } catch (e) {
        prepared.delete(token);
        return reply.code(500).type("text/xml").send(errorTwiml("Saathi could not prepare the call."));
      }
    }
    if (useMediaStreams) return reply.type("text/xml").send(connectStreamTwiml(wsUrlFor(req.headers.host ?? "localhost"), { token }));
    const p = prepared.get(token)!;
    if (p.session.currentState !== "ringing") return reply.type("text/xml").send(errorTwiml("This call was already answered."));
    try {
      const urls = await captureTurn(p, req.headers.host, () => p.session.answer());
      return reply.type("text/xml").send(playThenGatherTwiml({ audioUrls: urls, actionUrl: gatherUrl(req.headers.host, token), language: p.session.language }));
    } catch (e) {
      deps.log?.(`twilio: answer failed: ${(e as Error).message}`);
      return reply.type("text/xml").send(errorTwiml("Sorry, Saathi could not start the call."));
    }
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
