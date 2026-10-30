import type { JsonSchema } from "../../backend/src/tools.js";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  /** Parsed arguments; invalid JSON from the model becomes {} and is reported in `rawArguments`. */
  args: Record<string, unknown>;
  rawArguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface ChatResult {
  content: string | null;
  toolCalls: ToolCall[];
  ms: number;
  usage?: { prompt: number; completion: number };
}

export interface ChatClient {
  complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult>;
}

export interface SarvamChatOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

function toWire(m: ChatMessage): Record<string, unknown> {
  switch (m.role) {
    case "system":
    case "user":
      return { role: m.role, content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map<WireToolCall>((t) => ({ id: t.id, type: "function", function: { name: t.name, arguments: t.rawArguments } })) }
          : {}),
      };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, name: m.name, content: m.content };
  }
}

export function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** OpenAI-compatible chat client for Sarvam's /v1/chat/completions. */
export class SarvamChatClient implements ChatClient {
  private readonly model: string;
  private readonly url: string;
  private readonly temperature: number;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: SarvamChatOptions) {
    this.model = opts.model ?? "sarvam-105b-conversations";
    this.url = `${opts.baseUrl ?? "https://api.sarvam.ai"}/v1/chat/completions`;
    this.temperature = opts.temperature ?? 0.2;
    this.maxTokens = opts.maxTokens ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async complete(messages: ChatMessage[], tools: ToolSpec[]): Promise<ChatResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toWire),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };
    if (tools.length) {
      body.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
      body.tool_choice = "auto";
    }
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Sarvam chat ${res.status}: ${text.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices: Array<{ message: { content: string | null; tool_calls?: WireToolCall[] } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const msg = json.choices[0]?.message;
    if (!msg) throw new Error("Sarvam chat: empty choices");
    const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((t) => ({ id: t.id, name: t.function.name, args: parseToolArgs(t.function.arguments), rawArguments: t.function.arguments }));
    return {
      content: msg.content,
      toolCalls,
      ms: Date.now() - started,
      ...(json.usage ? { usage: { prompt: json.usage.prompt_tokens, completion: json.usage.completion_tokens } } : {}),
    };
  }
}
