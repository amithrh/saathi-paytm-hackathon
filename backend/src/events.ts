import { EventEmitter } from "node:events";
import type { ServerEvent } from "../../shared/types.js";

/** In-process fan-out of server events to SSE / WebSocket clients and tests. */
export class EventBus {
  private emitter = new EventEmitter();
  private history: ServerEvent[] = [];
  readonly maxHistory = 500;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  publish(event: ServerEvent): void {
    this.history.push(event);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.emitter.emit("event", event);
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }

  /** Recent events, optionally for one merchant, oldest first. */
  recent(merchantId?: string): ServerEvent[] {
    return this.history.filter((e) => {
      if (!merchantId) return true;
      if (e.type === "approval") return e.approval.merchantId === merchantId;
      if (e.type === "action") return e.entry.merchantId === merchantId;
      return e.merchantId === merchantId;
    });
  }
}
