import { describe, expect, it } from "vitest";
import { fixedClock } from "../../backend/src/clock.js";
import { EventBus } from "../../backend/src/events.js";
import { RAVI_ID } from "../../backend/src/seed.js";
import { MerchantStore } from "../../backend/src/store.js";
import { cleanSpeech, SaathiAgent } from "../src/agent.js";
import type { ChatClient, ChatMessage, ChatResult, ToolSpec } from "../src/llm.js";
import { CALL_CONNECTED_MARKER, PRE_CALL_MARKER } from "../src/prompt.js";

type Step = (messages: ChatMessage[], tools: ToolSpec[]) => Omit<ChatResult, "ms">;

/** Scripted LLM: each call pops the next step. Records what it was shown. */
class FakeChat implements ChatClient {
  seen: ChatMessage[][] = [];
  constructor(private steps: Step[]) {}
  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    this.seen.push(structuredClone(messages));
    const step = this.steps.shift();
    if (!step) throw new Error("FakeChat: no more steps");
    return { ...step(messages, tools), ms: 1 };
  }
}

const call = (id: string, name: string, args: Record<string, unknown>) => ({ id, name, args, rawArguments: JSON.stringify(args) });
const say = (text: string): Step => () => ({ content: text, toolCalls: [] });
const tools = (...calls: ReturnType<typeof call>[]): Step => () => ({ content: null, toolCalls: calls });

function setup(steps: Step[]) {
  const clock = fixedClock("2026-10-31T10:15:00+05:30");
  const store = MerchantStore.seeded(clock);
  const bus = new EventBus();
  const llm = new FakeChat(steps);
  const agent = new SaathiAgent({ llm, store, clock, merchantId: RAVI_ID, callId: "c1", bus });
  return { agent, llm, store, bus };
}

describe("SaathiAgent loop", () => {
  it("sends the system prompt in the merchant's language and the pre-call marker", async () => {
    const { agent, llm } = setup([tools(call("1", "get_briefing", {})), tools(call("2", "restart_device", { device_id: "SB-7F42" })), say("READY")]);
    const t = await agent.prepare();
    expect(t.speech).toBe("");
    expect(t.llmCalls).toBe(3);
    expect(t.toolCalls.map((c) => [c.actor, c.tool])).toEqual([["Diagnoser", "get_briefing"], ["Fixer", "restart_device"]]);
    const first = llm.seen[0]!;
    expect(first[0]!.role).toBe("system");
    expect((first[0] as { content: string }).content).toMatch(/Devanagari/);
    expect((first[0] as { content: string }).content).toMatch(/Ravi Kumar/);
    expect(first[1]).toEqual({ role: "user", content: PRE_CALL_MARKER });
    // Tool results were fed back to the model.
    const third = llm.seen[2]!;
    const toolMsg = third.find((m) => m.role === "tool" && m.name === "restart_device") as { content: string };
    expect(JSON.parse(toolMsg.content)).toMatchObject({ status: "online", confirmed_amount: 1340 });
  });

  it("feeds tool failures back so the model can recover, and gates send_reminder", async () => {
    const { agent, llm, store } = setup([
      say("READY"),
      say("नमस्ते"),
      tools(call("a", "send_reminder", { customer_id: "c-suresh" })),
      tools(call("b", "compliance_check", { action: "send_reminder", customer_id: "c-suresh" }), call("c", "send_reminder", { customer_id: "c-suresh" })),
      say("भेज दिया।"),
    ]);
    await agent.prepare();
    expect((await agent.open()).speech).toBe("नमस्ते");
    const t = await agent.respond("हाँ, सुरेश को रिमाइंडर भेजो।");
    expect(t.toolCalls.map((c) => `${c.actor}:${c.tool}:${c.ok}`)).toEqual(["Fixer:send_reminder:false", "Compliance:compliance_check:true", "Fixer:send_reminder:true"]);
    const failMsg = llm.seen[3]!.find((m) => m.role === "tool") as { content: string };
    expect(JSON.parse(failMsg.content)).toMatchObject({ error: "COMPLIANCE_REQUIRED" });
    expect(t.speech).toBe("भेज दिया।");
    expect(store.get(RAVI_ID).udhaar.find((u) => u.customerId === "c-suresh")!.status).toBe("reminded");
    expect(agent.hasEnded).toBe(false);
    expect(llm.seen[1]![llm.seen[1]!.length - 1]).toEqual({ role: "user", content: CALL_CONNECTED_MARKER });
  });

  it("marks the call ended when end_call runs and keeps the goodbye", async () => {
    const { agent } = setup([say("READY"), say("hi"), tools(call("x", "end_call", { reason: "done" })), say("नमस्ते, फिर मिलेंगे।")]);
    await agent.prepare();
    await agent.open();
    const t = await agent.respond("ठीक है, धन्यवाद।");
    expect(t.endCall).toBe(true);
    expect(agent.hasEnded).toBe(true);
    expect(t.speech).toBe("नमस्ते, फिर मिलेंगे।");
  });

  it("survives an unknown tool and stops at the round limit", async () => {
    const clock = fixedClock("2026-10-31T10:15:00+05:30");
    const store = MerchantStore.seeded(clock);
    const steps: Step[] = Array.from({ length: 10 }, (_, i) => tools(call(String(i), "no_such_tool", {})));
    const llm = new FakeChat(steps);
    const agent = new SaathiAgent({ llm, store, clock, merchantId: RAVI_ID, callId: "c2", maxToolRounds: 2 });
    const t = await agent.open();
    expect(t.llmCalls).toBe(3);
    expect(t.toolCalls.every((c) => !c.ok)).toBe(true);
  });

  it("empty merchant speech becomes an unclear-audio marker", async () => {
    const { agent, llm } = setup([say("READY"), say("hi"), say("माफ़ कीजिए, फिर से बोलिए?")]);
    await agent.prepare();
    await agent.open();
    await agent.respond("   ");
    expect(llm.seen[2]!.at(-1)).toEqual({ role: "user", content: "[unclear audio]" });
  });
});

describe("cleanSpeech", () => {
  it("strips markdown, bullets and emoji", () => {
    expect(cleanSpeech("**नमस्ते** रवि जी 🙏\n- एक\n- दो")).toBe("नमस्ते रवि जी\nएक\nदो");
  });
});
