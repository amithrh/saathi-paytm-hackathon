/** PCM helpers shared by the browser transport, the Twilio transport and the TTS/STT glue. */

export interface PcmAudio {
  sampleRate: number;
  channels: number;
  samples: Int16Array; // mono after wavToPcm16
}

export function pcm16ToWav(samples: Int16Array, sampleRate: number): Buffer {
  const dataBytes = samples.length * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) buf.writeInt16LE(samples[i]!, 44 + i * 2);
  return buf;
}

/** Parse a RIFF/WAVE buffer (16-bit PCM). Stereo is downmixed to mono. */
export function wavToPcm16(buf: Buffer): PcmAudio {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("not a WAV file");
  let off = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let data: Buffer | undefined;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt ") {
      const format = buf.readUInt16LE(body);
      if (format !== 1) throw new Error(`unsupported WAV format ${format}`);
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bits = buf.readUInt16LE(body + 14);
    } else if (id === "data") {
      data = buf.subarray(body, Math.min(buf.length, body + size));
    }
    off = body + size + (size % 2);
  }
  if (!data || !sampleRate) throw new Error("WAV missing fmt or data chunk");
  if (bits !== 16) throw new Error(`unsupported bit depth ${bits}`);
  const frames = Math.floor(data.length / (2 * channels));
  const samples = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) acc += data.readInt16LE((i * channels + c) * 2);
    samples[i] = Math.round(acc / channels);
  }
  return { sampleRate, channels, samples };
}

/** Linear-interpolation resampler. Good enough for speech between 8k, 16k, 22.05k, 44.1k, 48k. */
export function resample(samples: Int16Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = pos - i0;
    out[i] = Math.round((samples[i0] ?? 0) * (1 - frac) + (samples[i1] ?? 0) * frac);
  }
  return out;
}

const MULAW_BIAS = 0x84;
const MULAW_CLIP = 32635;

export function mulawEncodeSample(sample: number): number {
  let s = Math.max(-32768, Math.min(32767, sample));
  const sign = s < 0 ? 0x80 : 0;
  if (s < 0) s = -s;
  if (s > MULAW_CLIP) s = MULAW_CLIP;
  s += MULAW_BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; exponent--, mask >>= 1) {
    /* find segment */
  }
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function mulawDecodeSample(byte: number): number {
  const u = ~byte & 0xff;
  const sign = u & 0x80;
  const exponent = (u >> 4) & 0x07;
  const mantissa = u & 0x0f;
  let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
  sample -= MULAW_BIAS;
  return sign ? -sample : sample;
}

export function pcm16ToMulaw(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = mulawEncodeSample(samples[i]!);
  return out;
}

export function mulawToPcm16(bytes: Uint8Array): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = mulawDecodeSample(bytes[i]!);
  return out;
}

export function rms(samples: Int16Array): number {
  if (!samples.length) return 0;
  let acc = 0;
  for (let i = 0; i < samples.length; i++) acc += samples[i]! * samples[i]!;
  return Math.sqrt(acc / samples.length);
}

export function concatInt16(parts: Int16Array[]): Int16Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Int16Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function bufferToInt16(buf: Buffer | ArrayBuffer | Uint8Array): Int16Array {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const even = u8.byteLength - (u8.byteLength % 2);
  const copy = new Uint8Array(even);
  copy.set(u8.subarray(0, even));
  return new Int16Array(copy.buffer);
}

/** Synthetic tone, handy for tests. */
export function tone(freqHz: number, seconds: number, sampleRate: number, amplitude = 8000): Int16Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * freqHz * i) / sampleRate));
  return out;
}

/**
 * Split speech into TTS-sized sentences. Handles the Devanagari danda, Latin punctuation and
 * keeps very short fragments attached to their neighbour so we do not fire a request per word.
 */
export function splitSentences(text: string, maxChars = 220): string[] {
  const raw = text
    .replace(/\s+/g, " ")
    .split(/(?<=[।?!]|\.(?=\s))\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const s of raw) {
    const last = out[out.length - 1];
    if (last !== undefined && (s.length < 25 || last.length + s.length < 60) && last.length + s.length + 1 <= maxChars) {
      out[out.length - 1] = `${last} ${s}`;
    } else if (s.length > maxChars) {
      // Break an over-long sentence on commas.
      let chunk = "";
      for (const piece of s.split(/(?<=,)\s*/)) {
        if ((chunk + " " + piece).trim().length > maxChars && chunk) {
          out.push(chunk.trim());
          chunk = piece;
        } else chunk = `${chunk} ${piece}`;
      }
      if (chunk.trim()) out.push(chunk.trim());
    } else out.push(s);
  }
  return out;
}
