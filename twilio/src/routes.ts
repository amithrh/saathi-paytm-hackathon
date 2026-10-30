import type { FastifyInstance } from "fastify";
import type { CallEvent, CallSession } from "../../voice/src/pipeline.js";

export interface TwilioRouteDeps {
  makeSession: (merchantId: string, onEvent: (e: CallEvent) => void) => CallSession;
  publicBaseUrl?: string;
  log?: (line: string) => void;
}

/** Placeholder; replaced by the real Twilio Media Streams routes in the twilio step. */
export async function registerTwilioRoutes(app: FastifyInstance, _deps: TwilioRouteDeps): Promise<void> {
  app.get("/twilio/status", async () => ({ configured: Boolean(process.env.TWILIO_ACCOUNT_SID) }));
}
