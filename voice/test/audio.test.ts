import { describe, expect, it } from "vitest";
import { bufferToInt16, mulawDecodeSample, mulawEncodeSample, mulawToPcm16, pcm16ToMulaw, pcm16ToWav, resample, rms, splitSentences, tone, wavToPcm16 } from "../src/audio.js";
import { UtteranceSegmenter } from "../src/vad.js";

describe("wav round trip", () => {
  it("encodes and decodes 16-bit mono PCM", () => {
    const s = tone(440, 0.1, 16000);
    const wav = pcm16ToWav(s, 16000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    const back = wavToPcm16(wav);
    expect(back.sampleRate).toBe(16000);
    expect(back.channels).toBe(1);
    expect(Array.from(back.samples)).toEqual(Array.from(s));
  });
  it("rejects non-wav", () => {
    expect(() => wavToPcm16(Buffer.from("hello world!"))).toThrow(/not a WAV/);
  });
});

describe("resample", () => {
  it("changes length by the rate ratio and keeps the tone", () => {
    const s = tone(440, 0.5, 48000);
    const out = resample(s, 48000, 16000);
    expect(out.length).toBe(8000);
    expect(Math.abs(rms(out) - rms(s)) / rms(s)).toBeLessThan(0.05);
  });
  it("is identity at equal rates", () => {
    const s = tone(300, 0.01, 8000);
    expect(resample(s, 8000, 8000)).toBe(s);
  });
});

describe("mu-law", () => {
  it("round-trips within codec tolerance", () => {
    for (const v of [0, 100, -100, 1000, -1000, 8000, -8000, 30000, -30000]) {
      const d = mulawDecodeSample(mulawEncodeSample(v));
      expect(Math.abs(d - v)).toBeLessThanOrEqual(Math.max(8, Math.abs(v) * 0.07));
    }
    expect(mulawEncodeSample(0)).toBe(0xff);
  });
  it("array helpers agree with sample helpers", () => {
    const s = tone(440, 0.02, 8000);
    const back = mulawToPcm16(pcm16ToMulaw(s));
    expect(back.length).toBe(s.length);
    expect(Math.abs(rms(back) - rms(s)) / rms(s)).toBeLessThan(0.05);
  });
});

describe("bufferToInt16", () => {
  it("drops a trailing odd byte", () => {
    expect(Array.from(bufferToInt16(Buffer.from([1, 0, 2, 0, 9])))).toEqual([1, 2]);
  });
});

describe("splitSentences", () => {
  it("splits Hindi on danda and question marks, merging tiny fragments", () => {
    const parts = splitSentences("नमस्ते रवि जी। मैं साथी बोल रही हूँ। कल आपकी कमाई 14200 रुपये थी और 50 पेमेंट आए थे। क्या मैं रिमाइंडर भेज दूँ?");
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.join(" ")).toContain("14200");
    expect(parts.at(-1)).toMatch(/भेज दूँ\?$/);
  });
  it("splits on Latin full stops followed by space", () => {
    const parts = splitSentences("ನಮಸ್ಕಾರ ಲಕ್ಷ್ಮಿ ಅವರೇ, ನಾನು ಸಾಥಿ. ನಿನ್ನೆ 11650 ರೂಪಾಯಿ ಬಂದಿದೆ, 42 ಪೇಮೆಂಟ್ಸ್ ಆಗಿದೆ. ರಿಮೈಂಡರ್ ಕಳಿಸಲಾ?");
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });
  it("never exceeds maxChars", () => {
    const long = Array.from({ length: 30 }, (_, i) => `हिस्सा ${i} यहाँ है,`).join(" ");
    for (const p of splitSentences(long, 100)) expect(p.length).toBeLessThanOrEqual(100);
  });
});

describe("UtteranceSegmenter", () => {
  function run(frames: Int16Array[], opts = {}) {
    const seg = new UtteranceSegmenter({ sampleRate: 8000, endSilenceMs: 300, minSpeechMs: 200, preRollMs: 40, ...opts });
    const out: Int16Array[] = [];
    seg.onUtterance((u) => out.push(u));
    for (const f of frames) seg.push(f);
    return { seg, out };
  }
  const silence = () => new Int16Array(160); // 20 ms
  const speech = () => tone(300, 0.02, 8000, 6000);

  it("emits one utterance after speech followed by silence", () => {
    const frames = [...Array(10).fill(0).map(silence), ...Array(30).fill(0).map(speech), ...Array(20).fill(0).map(silence)];
    const { out } = run(frames);
    expect(out).toHaveLength(1);
    // 20 ms pre-roll + 600 ms speech + 300 ms trailing silence = 920 ms
    expect(out[0]!.length).toBe(8000 * 0.92);
  });

  it("drops blips shorter than minSpeechMs", () => {
    const frames = [...Array(5).fill(0).map(speech), ...Array(20).fill(0).map(silence)];
    expect(run(frames).out).toHaveLength(0);
  });

  it("caps very long utterances", () => {
    const frames = Array(200).fill(0).map(speech); // 4 s
    const { out } = run(frames, { maxUtteranceMs: 1000 });
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("flush emits the pending utterance", () => {
    const { seg, out } = run(Array(20).fill(0).map(speech));
    expect(out).toHaveLength(0);
    seg.flush();
    expect(out).toHaveLength(1);
  });
});
