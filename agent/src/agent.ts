import type { Clock } from "../../backend/src/clock.js";
import type { EventBus } from "../../backend/src/events.js";
import type { MerchantStore } from "../../backend/src/store.js";
import { runToolByName, TOOLS, type ToolContext } from "../../backend/src/tools.js";
import type { ActionLogEntry } from "../../shared/types.js";
import { auditSpokenNumbers, numbersInResult, type NumberAudit } from "./numbers.js";
import type { ChatClient, ChatMessage, ToolSpec } from "./llm.js";
import { CALL_CONNECTED_MARKER, PRE_CALL_MARKER, systemPrompt } from "./prompt.js";

export interface AgentDeps {
  llm: ChatClient;
  store: MerchantStore;
  clock: Clock;
  merchantId: string;
  callId: string;
  bus?: EventBus;
  whatsapp?: ToolContext["whatsapp"];
  customerPhones?: ToolContext["customerPhones"];
  /** Tools visible to the model. Defaults to all registered tools. */
  tools?: readonly { name: string; description: string; parameters: ToolSpec["parameters"] }[];
  maxToolRounds?: number;
  log?: (line: string) => void;
}

export interface AgentTurn {
  /** What Saathi says. Empty for the silent pre-call turn. */
  speech: string;
  /** True once the model called end_call. */
  endCall: boolean;
  toolCalls: ActionLogEntry[];
  llmMs: number;
  llmCalls: number;
  toolsMs: number;
  /** Spoken amounts checked against every tool result seen on this call. */
  numberAudit: NumberAudit;
}

/**
 * One agent, one conversation. Tool calls are executed in-process against the store;
 * every call is logged with the role the tool belongs to.
 */
export class SaathiAgent {
  readonly messages: ChatMessage[] = [];
  private readonly toolSpecs: ToolSpec[];
  private readonly ctx: ToolContext;
  private readonly maxRounds: number;
  private ended = false;
  /** Every number any tool has returned on this call. */
  private readonly backing = new Set<number>();
  private auditSeq = 0;

  constructor(private readonly deps: AgentDeps) {
    const merchant = deps.store.get(deps.merchantId);
    this.messages.push({ role: "system", content: systemPrompt(merchant) });
    this.toolSpecs = (deps.tools ?? TOOLS).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
    this.ctx = { store: deps.store, clock: deps.clock, merchantId: deps.merchantId, callId: deps.callId, ...(deps.bus ? { bus: deps.bus } : {}), ...(deps.whatsapp ? { whatsapp: deps.whatsapp } : {}), ...(deps.customerPhones ? { customerPhones: deps.customerPhones } : {}) };
    this.maxRounds = deps.maxToolRounds ?? 6;
  }

  get hasEnded(): boolean {
    return this.ended;
  }

  /** Pre-call diagnostics while the phone rings: briefing plus safe fixes. Silent. */
  async prepare(): Promise<AgentTurn> {
    const t = await this.turn(PRE_CALL_MARKER);
    return { ...t, speech: "" };
  }

  /** The merchant picked up: greeting and briefing. */
  async open(): Promise<AgentTurn> {
    return this.turn(CALL_CONNECTED_MARKER);
  }

  /** The merchant said something. */
  async respond(merchantText: string): Promise<AgentTurn> {
    return this.turn(merchantText.trim() || "[unclear audio]");
  }

  private async turn(userText: string): Promise<AgentTurn> {
    this.messages.push({ role: "user", content: userText });
    const turn: AgentTurn = { speech: "", endCall: false, toolCalls: [], llmMs: 0, llmCalls: 0, toolsMs: 0, numberAudit: { spoken: [], unbacked: [] } };
    for (let round = 0; round <= this.maxRounds; round++) {
      const res = await this.deps.llm.complete(this.messages, this.toolSpecs);
      turn.llmMs += res.ms;
      turn.llmCalls++;
      this.messages.push({ role: "assistant", content: res.content, ...(res.toolCalls.length ? { toolCalls: res.toolCalls } : {}) });
      if (res.content?.trim()) turn.speech = res.content.trim();
      if (!res.toolCalls.length) break;
      if (round === this.maxRounds) {
        this.deps.log?.(`agent: tool round limit reached, stopping`);
        break;
      }
      for (const call of res.toolCalls) {
        const started = Date.now();
        const out = await runToolByName(call.name, call.args, this.ctx);
        turn.toolsMs += Date.now() - started;
        turn.toolCalls.push(out.entry);
        numbersInResult(out.result, this.backing);
        this.deps.log?.(`[${out.entry.actor}] ${call.name}(${JSON.stringify(call.args)}) -> ${out.ok ? "ok" : "FAILED"} ${out.entry.summary}`);
        if (call.name === "end_call" && out.ok) {
          turn.endCall = true;
          this.ended = true;
        }
        this.messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(out.result) });
      }
      if (turn.endCall) {
        // Let the model close with a final line only if it has not spoken yet.
        if (turn.speech) break;
      }
    }
    turn.speech = cleanSpeech(turn.speech);
    if (turn.speech) {
      turn.numberAudit = auditSpokenNumbers(turn.speech, this.backing);
      this.publishAudit(turn.numberAudit);
    }
    return turn;
  }

  private publishAudit(a: NumberAudit): void {
    if (!a.spoken.length) return;
    const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
    this.deps.bus?.publish({
      type: "action",
      entry: {
        id: `N-${this.deps.callId}-${++this.auditSeq}`,
        at: this.deps.clock.now().toISOString(),
        merchantId: this.deps.merchantId,
        callId: this.deps.callId,
        actor: "System",
        tool: "number_audit",
        args: { spoken: a.spoken },
        ok: a.unbacked.length === 0,
        summary: a.unbacked.length
          ? `Spoken amount${a.unbacked.length > 1 ? "s" : ""} ${a.unbacked.map(fmt).join(", ")} ha${a.unbacked.length > 1 ? "ve" : "s"} no backing tool result`
          : `Every spoken amount (${a.spoken.map(fmt).join(", ")}) is backed by a tool result`,
        source: "numbers collected from every tool result on this call; the model only phrases them",
        ms: 0,
      },
    });
    if (a.unbacked.length) this.deps.log?.(`NUMBER AUDIT: unbacked ${a.unbacked.join(", ")}`);
  }
}

/** Strip markdown and anything a TTS engine would stumble on. */
export function cleanSpeech(text: string): string {
  return text
    .replace(/\*\*|__|`/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
