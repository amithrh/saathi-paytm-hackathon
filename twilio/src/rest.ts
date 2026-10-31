export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export function twilioCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): TwilioCredentials | undefined {
  const accountSid = env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return undefined;
  return { accountSid, authToken, fromNumber };
}

export interface PlaceCallInput {
  to: string;
  /** Public HTTPS URL Twilio fetches TwiML from when the callee answers. */
  voiceUrl: string;
  statusCallbackUrl?: string;
}

/** Create an outbound call through Twilio's REST API. No SDK; one form POST. */
export async function placeCall(creds: TwilioCredentials, input: PlaceCallInput, fetchImpl: typeof fetch = fetch): Promise<{ callSid: string; status: string }> {
  // Only To, From and Url: Twilio's current trial tier rejects any other parameter
  // ("trial accounts have limited parameter access"). The voice webhook accepts GET.
  const body = new URLSearchParams({ To: input.to, From: creds.fromNumber, Url: input.voiceUrl });
  if (input.statusCallbackUrl) body.set("StatusCallback", input.statusCallbackUrl);
  const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds.accountSid)}/Calls.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${json.message ?? "call failed"}${json.code ? ` (code ${json.code})` : ""}`);
  return { callSid: json.sid ?? "", status: json.status ?? "queued" };
}
