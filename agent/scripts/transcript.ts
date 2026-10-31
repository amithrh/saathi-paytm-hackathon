/**
 * Run the scripted Ravi (or Lakshmi) conversation as text against the live Sarvam LLM.
 * Usage: npm run transcript -- [m001|m002]
 */
import { clockFromEnv } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { LAKSHMI_ID, RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import { SaathiAgent } from "../src/agent.js";
import { sarvamChatFromEnv } from "../src/env.js";
import { JUDGE_LINES } from "../src/script.js";

const merchantId = process.argv[2] && /^m\d{3}$/.test(process.argv[2]) ? process.argv[2] : RAVI_ID;
const clock = clockFromEnv();
const store = MerchantStore.seeded(clock);
const bus = new EventBus();
const lines = JUDGE_LINES[store.get(merchantId).language];

const agent = new SaathiAgent({ llm: sarvamChatFromEnv(), store, clock, merchantId, callId: "transcript", bus, log: (l) => console.log(`    ${l}`) });

function show(label: string, t: Awaited<ReturnType<SaathiAgent["respond"]>>) {
  console.log(`\n${label}`);
  if (t.speech) console.log(`  SAATHI: ${t.speech}`);
  console.log(`  (llm ${t.llmMs} ms over ${t.llmCalls} calls, tools ${t.toolsMs} ms${t.endCall ? ", END CALL" : ""})`);
}

const m = store.get(merchantId);
console.log(`Merchant: ${m.ownerName}, ${m.shopName}, ${m.language}. Clock: ${store.snapshot(merchantId).clockIst}`);
show("PRE-CALL", await agent.prepare());
show("OPENING", await agent.open());
for (const line of lines) {
  console.log(`\n  MERCHANT: ${line}`);
  show("TURN", await agent.respond(line));
  if (agent.hasEnded) break;
}
console.log("\nCounters:", store.counters(merchantId));
