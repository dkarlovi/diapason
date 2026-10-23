import { expect, it } from "vitest";
import { analysisOptionsFor, getSoundProfile } from "./recording-profiles";

it("uses stored detector settings and falls back safely for existing or invalid recordings", () => {
  expect(analysisOptionsFor({})).toMatchObject({ minFreq: 250, maxFreq: 3000, windowSize: 2048, hop: 512 });
  const analysis = { ...getSoundProfile("whistle").analysis, minFreq: 100 };
  expect(analysisOptionsFor({ source: { profileId: "whistle", analysis } }).minFreq).toBe(100);
  expect(analysisOptionsFor({ source: { profileId: "unknown", analysis } }).minFreq).toBe(250);
  expect(analysisOptionsFor({ source: { profileId: "whistle", analysis: { ...analysis, minFreq: NaN } } }).minFreq).toBe(250);
});
