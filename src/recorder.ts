import { ensureAudioWorklet } from "./audio-worklet";
// Captures contiguous raw PCM from the live mic so we can re-analyze it offline
// (tune detection without whistling live) and replay it. Uses an AudioWorklet,
// whose processor source is inlined via a Blob URL so there's no extra build step.

import { createPitchDetector, type PitchOptions } from "./pitch";
import { freqToMidi, type Frame } from "./notes";

const WORKLET_SRC = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() { super(); this.active = true; this.port.onmessage = () => { this.active = false; }; }
  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    const ch = input && input[0];
    if (ch && ch.length) this.port.postMessage({ samples: ch.slice(0), start: currentTime });
    return true;
  }
}
registerProcessor('diapason-recorder', RecorderProcessor);
`;

export interface Recorder {
  start(): void;
  /** Stops and returns the captured mono PCM as one contiguous buffer. */
  stop(): Float32Array;
  dispose(): void;
}

export async function createRecorder(ctx: AudioContext, source: AudioNode): Promise<Recorder> {
  await ensureAudioWorklet(ctx, "recorder", WORKLET_SRC);
  const node = new AudioWorkletNode(ctx, "diapason-recorder", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });

  let chunks: Float32Array[] = [];
  let capturing = false;
  let captureFrom = 0;
  let received = 0;

  node.port.onmessage = (event: MessageEvent<{ samples: Float32Array; start: number }>): void => {
    if (!capturing) return;
    const { samples, start } = event.data;
    const offset = Math.round((start - captureFrom) * ctx.sampleRate);
    const drop = Math.max(0, received - offset);
    if (drop >= samples.length) return;
    if (offset > received) {
      chunks.push(new Float32Array(offset - received));
      received = offset;
    }
    const chunk = samples.slice(drop);
    chunks.push(chunk);
    received += chunk.length;
  };
  source.connect(node);

  return {
    start(): void {
      chunks = [];
      received = 0;
      captureFrom = ctx.currentTime;
      capturing = true;
    },
    stop(): Float32Array {
      capturing = false;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const out = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    },
    dispose(): void {
      capturing = false;
      source.disconnect(node);
      node.port.onmessage = null;
      node.port.postMessage("stop");
      node.disconnect();
      node.port.close();
    },
  };
}

const ANALYZE_DEFAULTS = { windowSize: 2048, hop: 512 } as const;

export interface AnalyzeOptions extends PitchOptions {
  /** Analysis window size in samples. Default 2048. */
  windowSize?: number;
  /** Hop between windows in samples. Default windowSize / 4 (smooth trace). */
  hop?: number;
}

// Slide the pitch detector across a recorded buffer, producing the same Frame
// stream shape that live capture yields — so segmentation/visuals are identical.
export function analyzeBuffer(
  samples: Float32Array,
  sampleRate: number,
  opts: AnalyzeOptions = {},
): Frame[] {
  const windowSize = opts.windowSize ?? ANALYZE_DEFAULTS.windowSize;
  const hop = opts.hop ?? Math.floor(windowSize / 4);
  const detect = createPitchDetector(sampleRate, opts);

  const frames: Frame[] = [];
  const win = new Float32Array(windowSize);
  for (let start = 0; start + windowSize <= samples.length; start += hop) {
    win.set(samples.subarray(start, start + windowSize));
    const t = start / sampleRate;
    const { freq, clarity, rms } = detect(win);
    frames.push({ t, freq, clarity, rms });
  }
  return frames;
}

export interface QualityStats {
  voicedRatio: number; // fraction of frames with a detected pitch
  medianClarity: number; // typical NSDF peak on voiced frames
  centsStd: number; // pitch steadiness: std-dev of cents-from-semitone on voiced frames
  clipped: boolean; // did the signal clip?
  peak: number; // max absolute sample
}

// Summarizes how clean a frame stream is, for the calibration verdict checklist.
// Steadiness uses std-dev (not min/max) of each frame's distance to its nearest
// semitone, so a clean legato melody still scores well — only wobble/uncertainty hurts.
export function qualityStats(frames: Frame[], samples?: Float32Array): QualityStats {
  const voiced = frames.filter((f) => f.freq !== null);
  const voicedRatio = frames.length ? voiced.length / frames.length : 0;

  const clarities = voiced.map((f) => f.clarity).sort((a, b) => a - b);
  const medianClarity = clarities.length ? clarities[Math.floor(clarities.length / 2)]! : 0;

  const centsErrs = voiced.map((f) => {
    const m = freqToMidi(f.freq!);
    return (m - Math.round(m)) * 100;
  });
  const mean = centsErrs.reduce((s, c) => s + c, 0) / (centsErrs.length || 1);
  const variance = centsErrs.reduce((s, c) => s + (c - mean) ** 2, 0) / (centsErrs.length || 1);
  const centsStd = Math.sqrt(variance);

  let peak = 0;
  let clippedCount = 0;
  if (samples)
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i]!);
      if (a > peak) peak = a;
      if (a >= 0.999) clippedCount++;
    }
  // A stray clipped sample (onset pop) is harmless; only flag sustained clipping.
  const clipped = samples ? clippedCount / samples.length > 0.001 : false;

  return { voicedRatio, medianClarity, centsStd, clipped, peak };
}
