import { expect, it } from "vitest";
import {
  fittedPitch,
  followPan,
  revealPitchShift,
  sidebarWidth,
  timeWindow,
} from "./editor-viewport";

it("shares a finite window and pans far enough to uncover the end beneath Tune", () => {
  expect(timeWindow(20, 2, 1, 0.5)).toEqual({ tMin: 15, tMax: 25 });
  expect(timeWindow(0, 1, 0)).toEqual({ tMin: 0, tMax: 1 });
  expect(timeWindow(20, 2, -5)).toEqual({ tMin: 0, tMax: 10 });
});
it("follows playback from a future viewport and keeps the last notes uncovered", () => {
  expect(followPan(20, 4, 1, 0)).toBe(0);
  const pan = followPan(20, 4, 0, 5);
  expect(pan).toBeGreaterThan(0);
  const view = timeWindow(20, 4, followPan(20, 4, 0, 19, 0.5), 0.5);
  expect(view.tMin).toBeLessThan(19);
  expect(view.tMin + (view.tMax - view.tMin) * 0.5).toBeGreaterThanOrEqual(19);
});
it("fits interpreted pitches and provides a usable empty-recording range", () => {
  expect(fittedPitch([{ midi: 60 }, { midi: 72 }])).toEqual({ midiMin: 58, midiMax: 74 });
  expect(fittedPitch([{ midi: 69 }])).toEqual({ midiMin: 67, midiMax: 73 });
  expect(fittedPitch([])).toEqual({ midiMin: 67, midiMax: 96 });
});
it("limits desktop Tune between its minimum and half the workspace", () => {
  expect(sidebarWidth(100, 1200)).toBe(286);
  expect(sidebarWidth(900, 1200)).toBe(600);
  expect(sidebarWidth(360, 1200)).toBe(360);
});

it("keeps the ending visibly left of an overlay even with the plot's axis padding", async () => {
  const { uncoveredTimeFraction } = await import("./editor-viewport");
  const visible = uncoveredTimeFraction(800, 400);
  const view = timeWindow(20, 1, followPan(20, 1, 0, 20, visible), visible);
  const endingX = 57 + ((20 - view.tMin) / (view.tMax - view.tMin)) * (800 - 57 - 18);
  expect(endingX).toBeLessThan(400);
});
it("pans pitch only when a note would sit under a bottom overlay", () => {
  const view = { midiMin: 60, midiMax: 80 };
  expect(revealPitchShift(view, 75, 0.4)).toBe(0);
  const shift = revealPitchShift(view, 62, 0.4);
  expect(shift).toBeLessThan(0);
  // The note lands in the middle of the uncovered top 60%.
  expect((view.midiMax + shift - 62) / 20).toBeCloseTo(0.3);
  expect(revealPitchShift(view, 80, 0)).toBeGreaterThan(0);
});
