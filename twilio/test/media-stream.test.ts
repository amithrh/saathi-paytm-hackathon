import { describe, expect, it } from "vitest";
import type { CallState } from "../../shared/types.js";
import { mulawToPcm16, pcm16ToMulaw, pcm16ToWav, resample, rms, tone } from "../../voice/src/audio.js";
import type { CallEvent } from "../../voice/src/pipeline.js";
import { attachTwilioMediaStream, connectStreamTwiml, twilioPayloadToPcm16k, wavToTwilioPayloads, type SessionLike, type StreamSocket } from "../src/media-stream.js";

/** In-memory stand-in for the Twilio WebSocket. */
class FakeSocket implements StreamSocket {
  sent: Array<Record<string, unknown>> = [];
  closed?: { code?: number; reason?: string };
  private handlers: { message: Array<(data: Buffer) => void>; close: Array<() => void> } = { message: [], close: [] };
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number, reason?: string): void {
    this.closed = { ...(code !== undefined ? { code } : {}), ...(reason !== undefined ? { reason } : {}) };
    for (const h of this.handlers.close) h();
  }
  on(event: "message", fn: (data: Buffer | ArrayBuffer | Buffer[] | string) => void): void;
  on(event: "close", fn: () => void): void;
  on(event: "message" | "close", fn: ((data: Buffer | ArrayBuffer | Buffer[] | string) => void) | (() => void)): void {
    if (event === "message") this.handlers.message.push(fn as (data: Buffer) => void);
    else this.handlers.close.push(fn as () => void);
  }
  /** Twilio -> us */
  emit(msg: Record<string, unknown>): void {
    for (const h of this.handlers.message) h(Buffer.from(JSON.stringify(msg)));
  }
}

class StubSession implements SessionLike {
  callId = "call-stub";
  currentState: CallState = "ringing";
  answered = 0;
  utterances: Int16Array[] = [];
  hungUp: string[] = [];
  onEvent?: (e: CallEvent) => void;
  async answer(): Promise<void> {
    this.answered++;
    this.currentState = "live";
    // Speak one chunk, like the real session does on answer.
    this.onEvent?.({ type: "audio", wav: pcm16ToWav(tone(440, 0.5, 22050), 22050), seq: 1, chunk: 0, chunks: 1, text: "hello" });
  }
  async handleUtterance(pcm: Int16Array): Promise<void> {
    this.utterances.push(pcm);
  }
  hangup(reason?: string): void {
    this.hungUp.push(reason ?? "");
    this.currentState = "ended";
  }
}

const tick = () => new Promise((r) => setTimeout(r, 5));
const mediaFrame = (pcm8k: Int16Array) => ({ event: "media", streamSid: "MZ1", media: { track: "inbound", chunk: "1", timestamp: "0", payload: Buffer.from(pcm16ToMulaw(pcm8k)).toString("base64") } });

describe("codec glue", () => {
  it("turns a 22.05 kHz WAV into 20 ms mu-law frames", () => {
    const payloads = wavToTwilioPayloads(pcm16ToWav(tone(440, 1, 22050), 22050));
    expect(payloads.length).toBe(50); // 8000 bytes / 160
    expect(Buffer.from(payloads[0]!, "base64").length).toBe(160);
    const back = mulawToPcm16(new Uint8Array(Buffer.from(payloads[10]!, "base64")));
    expect(rms(back)).toBeGreaterThan(4000);
  });
  it("decodes an inbound payload to 16 kHz PCM", () => {
    const pcm8k = tone(300, 0.02, 8000);
    const pcm16k = twilioPayloadToPcm16k(Buffer.from(pcm16ToMulaw(pcm8k)).toString("base64"));
    expect(pcm16k.length).toBe(320);
  });
  it("writes TwiML with escaped parameters", () => {
    const xml = connectStreamTwiml("wss://x.ngrok.app/twilio/media", { token: "a&b" });
    expect(xml).toContain('<Stream url="wss://x.ngrok.app/twilio/media">');
    expect(xml).toContain('<Parameter name="token" value="a&amp;b"/>');
  });
});

describe("attachTwilioMediaStream", () => {
  async function wire() {
    const socket = new FakeSocket();
    const session = new StubSession();
    const params: Record<string, string>[] = [];
    attachTwilioMediaStream(socket, {
      resolveSession: async (p, onEvent) => {
        params.push(p);
        session.onEvent = onEvent;
        return session;
      },
    });
    socket.emit({ event: "connected", protocol: "Call", version: "1.0.0" });
    socket.emit({ event: "start", streamSid: "MZ1", start: { streamSid: "MZ1", callSid: "CA1", accountSid: "AC1", customParameters: { token: "tok-1" }, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } });
    await tick();
    return { socket, session, params };
  }

  it("answers the prepared session on start and streams the greeting back as mu-law frames with a mark", async () => {
    const { socket, session, params } = await wire();
    expect(params[0]).toEqual({ token: "tok-1" });
    expect(session.answered).toBe(1);
    const media = socket.sent.filter((m) => m.event === "media");
    expect(media.length).toBe(25); // 0.5 s at 8 kHz = 4000 bytes / 160
    expect(media[0]).toMatchObject({ streamSid: "MZ1" });
    const mark = socket.sent.find((m) => m.event === "mark") as { mark: { name: string } };
    expect(mark.mark.name).toBe("seq1-chunk0");
  });

  it("segments inbound audio into an utterance and hands it to the session at 16 kHz", async () => {
    const { socket, session } = await wire();
    const silence = () => new Int16Array(160);
    for (let i = 0; i < 25; i++) socket.emit(mediaFrame(silence())); // 0.5 s quiet
    for (let i = 0; i < 60; i++) socket.emit(mediaFrame(tone(300, 0.02, 8000, 6000))); // 1.2 s speech
    for (let i = 0; i < 50; i++) socket.emit(mediaFrame(silence())); // 1 s quiet -> end of utterance
    await tick();
    expect(session.utterances).toHaveLength(1);
    const u = session.utterances[0]!;
    // ~ (0.24 pre-roll + 1.2 speech + 0.8 trailing) s at 16 kHz
    expect(u.length).toBeGreaterThan(16000 * 2.0);
    expect(u.length).toBeLessThan(16000 * 2.5);
    expect(rms(resample(u, 16000, 8000))).toBeGreaterThan(1500);
  });

  it("ignores outbound-track echoes and hangs up on stop and on close", async () => {
    const { socket, session } = await wire();
    socket.emit({ event: "media", streamSid: "MZ1", media: { track: "outbound", chunk: "1", timestamp: "0", payload: Buffer.from(pcm16ToMulaw(tone(300, 0.5, 8000, 6000))).toString("base64") } });
    socket.emit({ event: "stop", streamSid: "MZ1" });
    await tick();
    expect(session.utterances).toHaveLength(0);
    expect(session.hungUp[0]).toMatch(/stopped/);
    socket.close();
    expect(session.hungUp.length).toBe(2);
  });

  it("closes the socket when the session cannot be resolved", async () => {
    const socket = new FakeSocket();
    attachTwilioMediaStream(socket, { resolveSession: async () => { throw new Error("unknown token"); } });
    socket.emit({ event: "start", streamSid: "MZ2", start: { streamSid: "MZ2", callSid: "CA2", accountSid: "AC1", customParameters: {}, mediaFormat: { encoding: "audio/x-mulaw", sampleRate: 8000, channels: 1 } } });
    await tick();
    expect(socket.closed?.code).toBe(1011);
  });
});
