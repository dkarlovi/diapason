import { expect, it } from "vitest";
import { summarizeWaveform, waveformBars } from "./waveform";

it("keeps empty and silent audio quiet and finite", () => {
  for (const pcm of [new Float32Array(), new Float32Array(1024)]) {
    const summary = summarizeWaveform(pcm);
    expect(summary.version).toBe(1);
    expect([...summary.rms].every((value) => value === 0)).toBe(true);
    expect(waveformBars(summary).every((value) => value === 0)).toBe(true);
  }
});

it("summarizes short audio without empty buckets or losing the final sample", () => {
  expect([...summarizeWaveform(new Float32Array([0, -0.5, 1])).rms]).toEqual([0, 0.5, 1]);
  const pcm = new Float32Array(257);
  pcm[256] = 1;
  const summary = summarizeWaveform(pcm);
  expect(summary.rms).toHaveLength(128);
  expect(summary.rms[127]).toBeCloseTo(Math.sqrt(1 / 3));
});

it("distinguishes envelopes and preserves pauses and relative loudness", () => {
  const first = summarizeWaveform(new Float32Array([0, 0, 0.25, -0.25, 1, -1, 0, 0]));
  const second = summarizeWaveform(new Float32Array([1, -1, 0, 0, 0.25, -0.25, 0, 0]));
  expect(waveformBars(first, 4)).toEqual([0, 0.25, 1, 0]);
  expect(waveformBars(second, 4)).toEqual([1, 0, 0.25, 0]);
});

it("pools RMS by energy across fractional bucket boundaries", () => {
  const summary = { version: 1 as const, rms: new Float32Array([0, 1, 0]) };
  expect(waveformBars(summary, 2)).toEqual([1, 1]);
  const bars = waveformBars({ version: 1, rms: new Float32Array([1, 0, 0, 1]) }, 2);
  expect(bars).toEqual([1, 1]);
  const pooled = waveformBars({ version: 1, rms: new Float32Array([1, 0, 0.5, 0.5]) }, 2);
  expect(pooled[0]).toBe(1);
  expect(pooled[1]).toBeCloseTo(Math.SQRT1_2);
  expect(waveformBars({ version: 1, rms: new Float32Array([1, 1, 0]) }, 2)[1]).toBeCloseTo(
    1 / Math.sqrt(3),
  );
  expect(waveformBars({ version: 1, rms: new Float32Array([0.00000001]) }, 2)).toEqual([0, 0]);
});
