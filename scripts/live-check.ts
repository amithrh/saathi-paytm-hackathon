/**
 * Pre-flight for the live phone + WhatsApp demo. Reads .env, talks to Twilio and this server, prints a pass/fail table.
 *
 *   npm run live:check                 # checks only (no messages sent)
 *   npm run live:check -- --send       # also sends one WhatsApp test message to SURESH_PHONE_NUMBER
 *   npm run live:check -- --server http://localhost:3000
 */
import { config } from "dotenv";
config({ quiet: true });
import { twilioCredentialsFromEnv } from "../twilio/src/rest.js";
import { customerPhonesFromEnv, whatsappSenderFromEnv } from "../whatsapp/src/client.js";

const args = process.argv.slice(2);
const sendTest = args.includes("--send");
const serverIdx = args.indexOf("--server");
const localServer = serverIdx >= 0 ? args[serverIdx + 1]! : "http://localhost:3000";

type Row = { check: string; status: "PASS" | "FAIL" | "SKIP"; detail: string };
const rows: Row[] = [];
const pass = (check: string, detail: string) => rows.push({ check, status: "PASS", detail });
const fail = (check: string, detail: string) => rows.push({ check, status: "FAIL", detail });
const skip = (check: string, detail: string) => rows.push({ check, status: "SKIP", detail });

const env = process.env;
const e164 = (s: string | undefined) => (s ?? "").replace(/[\s()-]/g, "");
const creds = twilioCredentialsFromEnv(env);
const missing = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "DEMO_PHONE_NUMBER", "PUBLIC_BASE_URL", "TWILIO_WHATSAPP_FROM", "SURESH_PHONE_NUMBER"].filter((k) => !env[k]?.trim());
if (missing.length) fail("Fields in .env", `missing: ${missing.join(", ")}`);
else pass("Fields in .env", "all seven live fields set");

async function twilioGet(path: string): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(creds!.accountSid)}${path}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${creds!.accountSid}:${creds!.authToken}`).toString("base64")}` },
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

let trial = false;
if (!creds) {
  skip("Twilio credentials", "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not all set");
} else {
  try {
    const acct = await twilioGet(".json");
    if (acct.ok) {
      trial = acct.json.type === "Trial";
      pass("Twilio credentials", `account "${acct.json.friendly_name}" is ${acct.json.status}, type ${acct.json.type}`);
    } else fail("Twilio credentials", `HTTP ${acct.status}: ${String(acct.json.message ?? "rejected")}`);
  } catch (e) {
    fail("Twilio credentials", (e as Error).message);
  }

  try {
    const nums = await twilioGet(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(e164(creds.fromNumber))}`);
    const list = (nums.json.incoming_phone_numbers as Array<{ phone_number: string; capabilities?: { voice?: boolean } }> | undefined) ?? [];
    if (list.length && list[0]!.capabilities?.voice !== false) pass("TWILIO_FROM_NUMBER owned, voice-capable", list[0]!.phone_number);
    else fail("TWILIO_FROM_NUMBER owned, voice-capable", list.length ? "number has no voice capability" : `${creds.fromNumber} is not on this account`);
  } catch (e) {
    fail("TWILIO_FROM_NUMBER owned", (e as Error).message);
  }

  const demo = e164(env.DEMO_PHONE_NUMBER);
  if (!demo) skip("DEMO_PHONE_NUMBER verified", "not set");
  else if (!trial) pass("DEMO_PHONE_NUMBER verified", "not a trial account, any number can be called");
  else {
    try {
      const v = await twilioGet(`/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(demo)}`);
      const ids = (v.json.outgoing_caller_ids as unknown[] | undefined) ?? [];
      if (ids.length) pass("DEMO_PHONE_NUMBER verified", `${demo} is a verified caller ID on this trial account`);
      else fail("DEMO_PHONE_NUMBER verified", `${demo} is NOT verified: Twilio console > Phone Numbers > Verified Caller IDs`);
    } catch (e) {
      fail("DEMO_PHONE_NUMBER verified", (e as Error).message);
    }
  }
}

const base = env.PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
if (!base) skip("PUBLIC_BASE_URL reachable", "not set (ngrok http 3000, then paste the https URL)");
else if (!/^https:\/\//.test(base)) fail("PUBLIC_BASE_URL reachable", "must be https for Twilio webhooks");
else {
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; clockIst?: string };
    if (r.ok && j.ok) pass("PUBLIC_BASE_URL reachable", `${base}/api/health ok, server clock ${j.clockIst}`);
    else fail("PUBLIC_BASE_URL reachable", `HTTP ${r.status} from ${base}/api/health (is npm run demo running behind the tunnel?)`);
  } catch (e) {
    fail("PUBLIC_BASE_URL reachable", (e as Error).message);
  }
}

try {
  const r = await fetch(`${localServer}/twilio/status`, { signal: AbortSignal.timeout(3000) });
  const j = (await r.json()) as { configured: boolean; publicBaseUrl: string | null };
  if (j.configured && j.publicBaseUrl) pass("Local server sees Twilio config", `${localServer} configured, webhooks via ${j.publicBaseUrl}`);
  else fail("Local server sees Twilio config", `${localServer}: configured=${j.configured}, publicBaseUrl=${j.publicBaseUrl}. Restart npm run demo after editing .env`);
} catch {
  fail("Local server sees Twilio config", `${localServer} not running (npm run demo)`);
}

const wa = whatsappSenderFromEnv(env);
const phones = customerPhonesFromEnv(env);
if (!wa) skip("WhatsApp sender", "TWILIO_WHATSAPP_FROM not set (sandbox number is whatsapp:+14155238886)");
else if (!phones["c-suresh"]) fail("WhatsApp sender", "SURESH_PHONE_NUMBER not set; Suresh's reminder would stay mock");
else if (!sendTest) pass("WhatsApp sender", `configured for Suresh at ${phones["c-suresh"]}; run with --send to send a test message`);
else {
  try {
    const r = await wa.send(phones["c-suresh"], "Saathi pre-flight: this phone will receive Ravi's udhaar reminder during the demo. Reply with the sandbox join code first if you have not.");
    pass("WhatsApp test message", `sent, ${r.sid} (${r.status}). If it does not arrive: the phone must have sent "join <code>" to the sandbox in the last 72 h`);
  } catch (e) {
    fail("WhatsApp test message", (e as Error).message);
  }
}

console.table(rows);
const failed = rows.filter((r) => r.status === "FAIL");
if (failed.length) {
  console.log(`\n${failed.length} check(s) failed. Fix those, restart npm run demo, run again.`);
  process.exit(1);
}
console.log(rows.some((r) => r.status === "SKIP") ? "\nNo failures, but some checks were skipped: the live path is not fully configured." : "\nAll checks passed. Place the call with: curl -X POST localhost:3000/twilio/call -H 'content-type: application/json' -d '{\"merchantId\":\"m001\"}'");
process.exit(rows.some((r) => r.status === "SKIP") ? 2 : 0);
