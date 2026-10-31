import { EventEmitter } from "node:events";
import type { ServerEvent } from "../../shared/types.js";

/** In-process fan-out of server events to SSE / WebSocket clients and tests. */
export class EventBus {
  private emitter = new EventEmitter();
  private history: Array<{ seq: number; event: ServerEvent }> = [];
  private seq = 0;
  readonly maxHistory = 500;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(event: ServerEvent): void {
    this.seq += 1;
    this.history.push({ seq: this.seq, event });
    if (this.history.length > this.maxHistory) this.history.shift();
    this.emitter.emit("event", event, this.seq);
  }

  subscribe(listener: (event: ServerEvent, seq: number) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  /** Recent events, optionally for one merchant, oldest first. */
  recent(merchantId?: string): ServerEvent[] {
    return this.since(0, merchantId).events;
  }

  /**
   * Events published after sequence number `after`, each tagged with its `seq`, plus the
   * latest sequence number. Lets a client poll for what it missed when a streaming
   * connection is buffered or dropped by a proxy.
   */
  since(after: number, merchantId?: string): { next: number; events: Array<ServerEvent & { seq: number }> } {
    const events = this.history
      .filter((h) => h.seq > after && matchesMerchant(h.event, merchantId))
      .map((h) => ({ ...h.event, seq: h.seq }));
    return { next: this.seq, events };
  }
}

export function matchesMerchant(e: ServerEvent, merchantId?: string): boolean {
  if (!merchantId) return true;
  if (e.type === "approval") return e.approval.merchantId === merchantId;
  if (e.type === "action") return e.entry.merchantId === merchantId;
  return e.merchantId === merchantId;
}
