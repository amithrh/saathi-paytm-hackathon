import { config } from "dotenv";
import { SarvamChatClient } from "./llm.js";

config({ quiet: true });

export function sarvamApiKey(): string | undefined {
  const k = process.env.SARVAM_API_KEY?.trim();
  return k || undefined;
}

export function requireSarvamKey(): string {
  const k = sarvamApiKey();
  if (!k) throw new Error("SARVAM_API_KEY is not set in .env");
  return k;
}

export function sarvamChatFromEnv(): SarvamChatClient {
  return new SarvamChatClient({ apiKey: requireSarvamKey() });
}
