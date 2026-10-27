import { expect, it } from "vitest";
import { createPitchDetector } from "./pitch";
import { getSoundProfile } from "./recording-profiles";

const sampleRate = 48000;
const tone = (freq: number, fundamental = 1, second = 0) =>
  Float32Array.from({ length: 4096 }, (_, i) => {
    const phase = (2 * Math.PI * freq * i) / sampleRate;
    return 0.1 * (fundamental * Math.sin(phase) + second * Math.sin(2 * phase));
  });
const options = getSoundProfile("voice-experimental").analysis;

it.each([70, 130, 440, 880, 1400])("detects voice fundamentals at %i Hz", (freq) => {
  const result = createPitchDetector(sampleRate, options)(tone(freq, 1, 0.7));
  expect(result.freq).toBeCloseTo(freq, 0);
});

it("uses the preferred range to resolve an ambiguous dominant second harmonic", () => {
  const result = createPitchDetector(sampleRate, {
    ...options,
    preferredRange: { minFreq: 90, maxFreq: 150 },
  })(tone(110, 0.2, 1));
  expect(result.freq).toBeCloseTo(110, 0);
});

it.each([110, 880])("keeps a clear %i Hz fundamental outside the preferred range", (freq) => {
  const result = createPitchDetector(sampleRate, {
    ...options,
    preferredRange: { minFreq: 200, maxFreq: 500 },
  })(tone(freq));
  expect(result.freq).toBeCloseTo(freq, 0);
});

it("rejects silence with or without a personal range", () => {
  const detect = createPitchDetector(sampleRate, {
    ...options,
    preferredRange: { minFreq: 100, maxFreq: 300 },
  });
  expect(detect(new Float32Array(4096)).freq).toBeNull();
});
