import { config } from "dotenv";
config({ quiet: true });

import { SarvamChatClient } from "../agent/src/llm.js";
import { clockFromEnv } from "../backend/src/clock.js";
import { EventBus } from "../backend/src/events.js";
import { MerchantStore } from "../backend/src/store.js";
import { FakeSpeechClient, SarvamSpeechClient } from "../voice/src/speech.js";
import { customerPhonesFromEnv, whatsappSenderFromEnv } from "../whatsapp/src/client.js";
import { buildApp, wireSimulations } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const apiKey = process.env.SARVAM_API_KEY?.trim();
if (!apiKey) {
  console.error("SARVAM_API_KEY is missing from .env. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
const clock = clockFromEnv();
const store = MerchantStore.seeded(clock);
const bus = new EventBus();
const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
const useFakeSpeech = process.env.SAATHI_FAKE_SPEECH === "1";

const whatsapp = whatsappSenderFromEnv();
const customerPhones = customerPhonesFromEnv();
const deps = {
  clock,
  ...(whatsapp ? { whatsapp } : {}),
  customerPhones,
  store,
  bus,
  llm: new SarvamChatClient({ apiKey }),
  speech: useFakeSpeech ? new FakeSpeechClient() : new SarvamSpeechClient({ apiKey }),
  simulatedPaymentDelayMs: Number(process.env.SIMULATED_PAYMENT_DELAY_MS ?? 25_000),
  ...(process.env.PUBLIC_BASE_URL ? { publicBaseUrl: process.env.PUBLIC_BASE_URL } : {}),
  log,
};
wireSimulations(deps);
const app = await buildApp(deps);
await app.listen({ port, host: "0.0.0.0" });

const snap = store.snapshot("m001");
console.log(`
Saathi demo server
  Dashboard (projector):  http://localhost:${port}/dashboard?merchant=m001
  Call screen (laptop):   http://localhost:${port}/call?merchant=m001
  Kannada merchant:       add ?merchant=m002 to either page
  Clock:                  ${snap.clockIst}${process.env.SAATHI_FAKE_NOW ? " (pinned by SAATHI_FAKE_NOW)" : ""}
  Speech:                 ${useFakeSpeech ? "FAKE (tones)" : "Sarvam bulbul:v3 / saarika:v2.5"}
  Twilio voice:           ${process.env.TWILIO_ACCOUNT_SID ? "credentials present" : "not configured (browser call only)"}
  WhatsApp:               ${whatsapp ? `LIVE via Twilio sandbox for ${Object.keys(customerPhones).join(", ") || "nobody (set SURESH_PHONE_NUMBER)"}` : "mock (dashboard only)"}
`);
