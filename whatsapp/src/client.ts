/**
 * WhatsApp delivery behind the udhaar reminder. Today: Twilio's WhatsApp Sandbox.
 * The tool layer calls `WhatsAppSender.send`; the mock path is simply "no sender configured".
 */
export interface WhatsAppSendResult {
  sid: string;
  status: string;
}

export interface WhatsAppSender {
  readonly label: string;
  send(toE164: string, body: string): Promise<WhatsAppSendResult>;
}

export interface TwilioWhatsAppConfig {
  accountSid: string;
  authToken: string;
  /** Sandbox or approved sender, e.g. whatsapp:+14155238886 */
  from: string;
}

export function normalizeWhatsAppAddress(n: string): string {
  const trimmed = n.trim().replace(/^whatsapp:/i, "").replace(/[\s()-]/g, "");
  return `whatsapp:${trimmed}`;
}

export class TwilioWhatsAppSender implements WhatsAppSender {
  readonly label = "Twilio WhatsApp";
  constructor(private readonly cfg: TwilioWhatsAppConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async send(toE164: string, body: string): Promise<WhatsAppSendResult> {
    const form = new URLSearchParams({ From: normalizeWhatsAppAddress(this.cfg.from), To: normalizeWhatsAppAddress(toE164), Body: body });
    const res = await this.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.cfg.accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
    if (!res.ok) throw new Error(`Twilio WhatsApp ${res.status}: ${json.message ?? "send failed"}${json.code ? ` (code ${json.code})` : ""}`);
    return { sid: json.sid ?? "", status: json.status ?? "queued" };
  }
}

/** Real phone numbers for seeded customers, from env. Only these customers get a live message. */
export function customerPhonesFromEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  if (env.SURESH_PHONE_NUMBER?.trim()) out["c-suresh"] = env.SURESH_PHONE_NUMBER.trim();
  if (env.MANJUNATH_PHONE_NUMBER?.trim()) out["c-manjunath"] = env.MANJUNATH_PHONE_NUMBER.trim();
  return out;
}

export function whatsappSenderFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl: typeof fetch = fetch): TwilioWhatsAppSender | undefined {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const from = env.TWILIO_WHATSAPP_FROM?.trim();
  if (!accountSid || !authToken || !from) return undefined;
  return new TwilioWhatsAppSender({ accountSid, authToken, from }, fetchImpl);
}

/** Records sends instead of making them. For tests and the fake-speech rehearsal mode. */
export class FakeWhatsAppSender implements WhatsAppSender {
  readonly label = "fake WhatsApp";
  sent: Array<{ to: string; body: string }> = [];
  constructor(private readonly failWith?: string) {}
  async send(to: string, body: string): Promise<WhatsAppSendResult> {
    if (this.failWith) throw new Error(this.failWith);
    this.sent.push({ to, body });
    return { sid: `SMfake${this.sent.length}`, status: "queued" };
  }
}
