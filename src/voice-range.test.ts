import { expect, it } from "vitest";
import { measureVoiceEndpoint, voiceRange } from "./voice-range";
import { getSoundProfile } from "./recording-profiles";
import type { Frame } from "./notes";

const profile = getSoundProfile("voice-experimental");
const held = (freq: number): Frame[] =>
  Array.from({ length: 40 }, (_, i) => ({ t: i * 0.05, freq, clarity: 0.99, rms: 0.03 }));

it("measures a held endpoint without allowing a single pitch outlier to set the limit", () => {
  const frames = held(130);
  frames[8] = { ...frames[8]!, freq: 900 };
  const result = measureVoiceEndpoint(frames, 0.1, 0.001, profile);
  expect(result.pass).toBe(true);
  expect(result.frequency).toBeCloseTo(130);
});

it("rejects a sliding pitch even when each frame has high clarity", () => {
  const result = measureVoiceEndpoint(
    held(130).map((f, i) => ({ ...f, freq: 130 * 2 ** (i / 40) })),
    0.1,
    0.001,
    profile,
  );
  expect(result.pass).toBe(false);
  expect(result.frequency).toBeNull();
});

it("rejects quiet or incomplete endpoints", () => {
  expect(measureVoiceEndpoint(held(130), 0.1, 0.02, profile).pass).toBe(false);
  expect(measureVoiceEndpoint(held(130).slice(0, 4), 0.1, 0.001, profile).pass).toBe(false);
  expect(measureVoiceEndpoint([], 0, 0.001, profile).frequency).toBeNull();
});

it("adds three semitones of margin while respecting the broad source band", () => {
  expect(voiceRange(130, 440, profile.analysis)).toEqual({
    minFreq: 130 / 2 ** 0.25,
    maxFreq: 440 * 2 ** 0.25,
  });
  expect(voiceRange(65, 1500, profile.analysis)).toEqual({ minFreq: 65, maxFreq: 1500 });
  expect(voiceRange(440, 130, profile.analysis)).toBeNull();
  expect(voiceRange(130, 130, profile.analysis)).toBeNull();
  expect(voiceRange(NaN, 440, profile.analysis)).toBeNull();
});
