import type { CallEvent, CallSession } from "../../voice/src/pipeline.js";
import { mulawToPcm16, pcm16ToMulaw, resample, wavToPcm16 } from "../../voice/src/audio.js";
import { UtteranceSegmenter } from "../../voice/src/vad.js";

/** Subset of the Twilio Media Streams protocol we use. */
export type TwilioInbound =
  | { event: "connected"; protocol: string; version: string }
  | { event: "start"; streamSid: string; start: { streamSid: string; callSid: string; accountSid: string; customParameters?: Record<string, string>; mediaFormat: { encoding: string; sampleRate: number; channels: number } } }
  | { event: "media"; streamSid: string; media: { track: string; chunk: string; timestamp: string; payload: string } }
  | { event: "mark"; streamSid: string; mark: { name: string } }
  | { event: "stop"; streamSid: string };

export type TwilioOutbound =
  | { event: "media"; streamSid: string; media: { payload: string } }
  | { event: "mark"; streamSid: string; mark: { name: string } }
  | { event: "clear"; streamSid: string };

/** The bit of a WebSocket we need, so tests can pass a fake. */
export interface StreamSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: "message", fn: (data: Buffer | ArrayBuffer | Buffer[] | string) => void): void;
  on(event: "close", fn: () => void): void;
}

/** What the media stream needs from a call session (structural, so tests can stub it). */
export type SessionLike = Pick<CallSession, "callId" | "currentState" | "answer" | "handleUtterance" | "hangup">;

export interface MediaStreamDeps {
  /** Resolve a prepared session by the token we put in the TwiML <Parameter>; or create one for an inbound call. */
  resolveSession: (params: Record<string, string>, onEvent: (e: CallEvent) => void) => Promise<SessionLike>;
  log?: (line: string) => void;
  /** Bytes per outbound media message. Twilio wants 20 ms frames (160 bytes) but accepts larger. */
  frameBytes?: number;
}

const TWILIO_RATE = 8000;
const PIPELINE_RATE = 16000;

/** Mu-law 8 kHz PCM in from the phone; mu-law 8 kHz out from WAV chunks produced by TTS. */
export function wavToTwilioPayloads(wav: Buffer, frameBytes = 160): string[] {
  const pcm = wavToPcm16(wav);
  const at8k = resample(pcm.samples, pcm.sampleRate, TWILIO_RATE);
  const mu = pcm16ToMulaw(at8k);
  const out: string[] = [];
  for (let i = 0; i < mu.length; i += frameBytes) out.push(Buffer.from(mu.subarray(i, i + frameBytes)).toString("base64"));
  return out;
}

export function twilioPayloadToPcm16k(payload: string): Int16Array {
  const mu = new Uint8Array(Buffer.from(payload, "base64"));
  return resample(mulawToPcm16(mu), TWILIO_RATE, PIPELINE_RATE);
}

/**
 * Attach one Twilio media stream to a CallSession. Inbound frames go through the VAD segmenter
 * so the pipeline sees whole utterances; outbound TTS chunks are converted and streamed back.
 */
export function attachTwilioMediaStream(socket: StreamSocket, deps: MediaStreamDeps): { onClosed: Promise<void> } {
  let streamSid = "";
  let session: SessionLike | undefined;
  let marks = 0;
  const segmenter = new UtteranceSegmenter({ sampleRate: TWILIO_RATE, startThreshold: 700, endSilenceMs: 800, minSpeechMs: 350, preRollMs: 240 });
  let resolveClosed: () => void = () => undefined;
  const onClosed = new Promise<void>((r) => (resolveClosed = r));

  const send = (msg: TwilioOutbound) => socket.send(JSON.stringify(msg));

  const onEvent = (e: CallEvent) => {
    if (e.type === "audio" && streamSid) {
      for (const payload of wavToTwilioPayloads(e.wav, deps.frameBytes ?? 160)) send({ event: "media", streamSid, media: { payload } });
      send({ event: "mark", streamSid, mark: { name: `seq${e.seq}-chunk${e.chunk}` } });
    }
    if (e.type === "state" && e.state === "ended") {
      // Twilio hangs up when the stream closes and the TwiML has nothing after <Connect>.
      setTimeout(() => socket.close(1000, "call ended"), 6000);
    }
  };

  segmenter.onUtterance((pcm8k) => {
    if (!session) return;
    const pcm16k = resample(pcm8k, TWILIO_RATE, PIPELINE_RATE);
    deps.log?.(`twilio: utterance ${(pcm8k.length / TWILIO_RATE).toFixed(1)} s`);
    void session.handleUtterance(pcm16k);
  });

  socket.on("message", (raw) => {
    let msg: TwilioInbound;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : Buffer.from(raw as ArrayBuffer).toString("utf8")) as TwilioInbound;
    } catch {
      return;
    }
    switch (msg.event) {
      case "connected":
        deps.log?.(`twilio: connected (${msg.protocol} ${msg.version})`);
        return;
      case "start": {
        streamSid = msg.start.streamSid || msg.streamSid;
        const params = msg.start.customParameters ?? {};
        deps.log?.(`twilio: stream ${streamSid} started, call ${msg.start.callSid}, params ${JSON.stringify(params)}`);
        deps
          .resolveSession(params, onEvent)
          .then(async (s) => {
            session = s;
            if (s.currentState === "ringing") await s.answer();
          })
          .catch((e) => {
            deps.log?.(`twilio: could not attach session: ${(e as Error).message}`);
            socket.close(1011, "no session");
          });
        return;
      }
      case "media":
        if (msg.media.track && msg.media.track !== "inbound") return;
        segmenter.push(mulawToPcm16(new Uint8Array(Buffer.from(msg.media.payload, "base64"))));
        return;
      case "mark":
        marks++;
        return;
      case "stop":
        segmenter.flush();
        session?.hangup("twilio stream stopped");
        return;
    }
  });
  socket.on("close", () => {
    segmenter.flush();
    session?.hangup("twilio socket closed");
    resolveClosed();
  });

  return { onClosed };
}

/** TwiML that connects the answered call to our media stream, carrying the session token. */
export function connectStreamTwiml(wsUrl: string, params: Record<string, string>): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const parameters = Object.entries(params).map(([k, v]) => `<Parameter name="${esc(k)}" value="${esc(v)}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${esc(wsUrl)}">${parameters}</Stream></Connect></Response>`;
}
