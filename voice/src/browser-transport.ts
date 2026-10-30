import type { WebSocket } from "ws";
import type { CallSessionDeps } from "./pipeline.js";
import { CallSession, type CallEvent } from "./pipeline.js";
import { bufferToInt16 } from "./audio.js";

export type BrowserClientMessage =
  | { type: "start"; merchantId: string }
  | { type: "answer" }
  | { type: "text"; text: string }
  | { type: "hangup" };

export interface BrowserTransportDeps {
  makeSession: (merchantId: string, onEvent: (e: CallEvent) => void) => CallSession;
  log?: (line: string) => void;
}

/** JSON over WebSocket for control and events; one binary frame per push-to-talk utterance (16 kHz PCM16). */
export function attachBrowserTransport(socket: WebSocket, deps: BrowserTransportDeps): void {
  let session: CallSession | undefined;
  const send = (obj: Record<string, unknown>) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(obj));
  };
  const onEvent = (e: CallEvent) => {
    if (e.type === "audio") send({ type: "audio", seq: e.seq, chunk: e.chunk, chunks: e.chunks, text: e.text, wav: e.wav.toString("base64") });
    else send(e as unknown as Record<string, unknown>);
    if (e.type === "state" && e.state === "ended") setTimeout(() => socket.close(1000, "call ended"), 500);
  };

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      if (!session) return send({ type: "error", message: "no call in progress" });
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      void session.handleUtterance(bufferToInt16(buf));
      return;
    }
    let msg: BrowserClientMessage;
    try {
      msg = JSON.parse(data.toString()) as BrowserClientMessage;
    } catch {
      return send({ type: "error", message: "bad json" });
    }
    switch (msg.type) {
      case "start": {
        if (session) return send({ type: "error", message: "call already started" });
        try {
          session = deps.makeSession(msg.merchantId, onEvent);
        } catch (e) {
          return send({ type: "error", message: (e as Error).message });
        }
        deps.log?.(`browser call ${session.callId} for ${msg.merchantId}`);
        session.prepare().catch((e) => send({ type: "error", message: `prepare failed: ${(e as Error).message}` }));
        return;
      }
      case "answer":
        if (!session) return send({ type: "error", message: "start first" });
        session.answer().catch((e) => send({ type: "error", message: (e as Error).message }));
        return;
      case "text":
        if (!session) return send({ type: "error", message: "start first" });
        void session.handleText(String(msg.text ?? ""));
        return;
      case "hangup":
        session?.hangup("merchant hung up");
        return;
      default:
        send({ type: "error", message: "unknown message" });
    }
  });
  socket.on("close", () => session?.hangup("socket closed"));
}

export type { CallSessionDeps };
