import { getSoundProfile } from "./RecordingProfiles";
import { describe, expect, it } from "vitest";
import {
  noiseCalibration,
  trimCountIn,
  roundTripLatency,
  peakLevel,
  dspStatus,
  evaluateRoom,
  evaluateSound,
} from "./Capture.model";

describe("capture calculations", () => {
  it("derives the same bounded gate from room samples", () => {
    expect(noiseCalibration([0.004, 0.002, 0.003, 0.005])).toEqual({ floor: 0.005, gate: 0.0075 });
    expect(noiseCalibration([])).toEqual({ floor: 0, gate: 0.003 });
    expect(noiseCalibration([1])).toEqual({ floor: 1, gate: 0.1 });
  });

  it("cuts the count in and computes the captured peak", () => {
    const trimmed = trimCountIn(new Float32Array([0.1, -0.2, 0.7, -0.8]), 1.2, 1, 10);
    expect([...trimmed]).toEqual([0.699999988079071, -0.800000011920929]);
    expect(peakLevel(trimmed)).toBeCloseTo(0.8);
  });

  it("sums the reported output and input latency, ignoring missing figures", () => {
    expect(
      roundTripLatency({ baseLatency: 0.01, outputLatency: 0.04 }, { latency: 0.02 }),
    ).toBeCloseTo(0.07);
    expect(roundTripLatency({ outputLatency: Number.NaN }, {})).toBe(0);
    expect(roundTripLatency({ outputLatency: 5 }, {})).toBe(1);
  });

  it("marks browser DSP settings as on only when explicitly enabled", () => {
    expect(dspStatus({ echoCancellation: true, noiseSuppression: false })).toEqual([
      { name: "echoCancellation", off: false, known: true },
      { name: "noiseSuppression", off: true, known: true },
      { name: "autoGainControl", off: false, known: false },
    ]);
  });
});

const roomSamples = (rms: number, peak = rms) =>
  Array.from({ length: 15 }, (_, i) => ({ t: i / 10, rms, peak }));
it("requires actual quiet room samples and rejects stalled, noisy or clipping measurement", () => {
  expect(evaluateRoom([]).pass).toBe(false);
  expect(evaluateRoom(roomSamples(0.01)).pass).toBe(true);
  expect(evaluateRoom(roomSamples(0.0101)).pass).toBe(false);
  expect(evaluateRoom(roomSamples(0.001, 0.98)).pass).toBe(false);
  expect(evaluateRoom(roomSamples(0.001).map((s) => ({ ...s, t: 0 }))).pass).toBe(false);
  expect(evaluateRoom(roomSamples(NaN)).pass).toBe(false);
  expect(evaluateRoom(roomSamples(0.004))).toMatchObject({ floor: 0.004, gate: 0.006 });
});
it("requires usable tone above noise without requiring steady musical pitch", () => {
  const frames = Array.from({ length: 20 }, (_, i) => ({
    t: i / 10,
    freq: i % 2 ? 440 : 470,
    clarity: 0.99,
    rms: 0.03,
  }));
  expect(evaluateSound(frames, 0.2, 0.001, getSoundProfile("whistle")).pass).toBe(true);
  expect(evaluateSound(frames, 0.98, 0.001, getSoundProfile("whistle")).pass).toBe(false);
  expect(evaluateSound(frames, 0.2, 0.02, getSoundProfile("whistle")).pass).toBe(false);
  expect(evaluateSound(frames.slice(0, 3), 0.2, 0.001, getSoundProfile("whistle")).pass).toBe(
    false,
  );
  expect(
    evaluateSound(
      frames.map((f) => ({ ...f, freq: null })),
      0.2,
      0.001,
      getSoundProfile("whistle"),
    ).pass,
  ).toBe(false);
});

it("rejects measurements with long gaps even if first/last timestamps span the test", () => {
  const samples = [0, 0.01, 0.02, 0.03, 0.04, 1.3, 1.31, 1.32, 1.33, 1.34].map((t) => ({
    t,
    rms: 0.001,
    peak: 0.002,
  }));
  expect(evaluateRoom(samples).pass).toBe(false);
});
