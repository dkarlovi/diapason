import { expect, it } from "vitest";
import { adjustTempo, estimateTempo } from "./Tempo.model";
it.each([
  [60, [0, 1, 2, 3, 4]],
  [120, [0, 0.5, 1, 1.5, 2]],
  [40, [0, 1.5, 3, 4.5, 6]],
  [220, [0, 60 / 220, 120 / 220, 180 / 220, 240 / 220]],
])("estimates %s BPM from consistent beats", (bpm, times) => {
  expect(estimateTempo(times as number[])).toMatchObject({ bpm, stable: true, eventCount: 5 });
});
it("requires enough valid events and rejects unstable timing, pauses and duplicates", () => {
  expect(estimateTempo([0, 0.5, 1]).stable).toBe(false);
  expect(estimateTempo([0, 0.3, 1.3, 1.6, 2.6]).stable).toBe(false);
  expect(estimateTempo([0, 0.5, 1, 1.5, 2, 5]).eventCount).toBe(1);
  expect(estimateTempo([0, 0, NaN, 0.5, 1, 1.5, 2])).toMatchObject({ bpm: 120, stable: true });
  expect(estimateTempo([0, 0.01, 0.02, 0.03, 0.04]).stable).toBe(false);
  expect(adjustTempo(90, 2)).toBe(180);
  expect(adjustTempo(90, 0.5)).toBe(45);
  expect(adjustTempo(180, 2)).toBeNull();
});
