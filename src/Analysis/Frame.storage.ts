import type { Frame } from "../Melody/Notes";

/** Float64 preserves JS numbers exactly, including timestamps used by MIDI/diagnostics. */
export function packFrames(frames: Frame[]): Float64Array<ArrayBuffer> {
  const packed = new Float64Array(frames.length * 4);
  frames.forEach(({ t, freq, clarity, rms }, i) => {
    packed.set([t, freq ?? NaN, clarity, rms], i * 4);
  });
  return packed;
}
export function unpackFrames(packed: Float64Array): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i < packed.length; i += 4) {
    const freq = packed[i + 1]!;
    frames.push({
      t: packed[i]!,
      freq: Number.isNaN(freq) ? null : freq,
      clarity: packed[i + 2]!,
      rms: packed[i + 3]!,
    });
  }
  return frames;
}
