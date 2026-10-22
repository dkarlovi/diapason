import { describe, expect, it } from "vitest";
import { noiseCalibration, trimCountIn, peakLevel, dspStatus } from "./capture-model";

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

  it("marks browser DSP settings as on only when explicitly enabled", () => {
    expect(dspStatus({ echoCancellation: true, noiseSuppression: false })).toEqual([
      { name: "echoCancellation", off: false },
      { name: "noiseSuppression", off: true },
      { name: "autoGainControl", off: true },
    ]);
  });
});
