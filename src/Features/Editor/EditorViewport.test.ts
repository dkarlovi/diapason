import { pitchAboveSheet } from "./EditorViewport";
import { expect, it } from "vitest";
import {
  fittedPitch,
  followPan,
  revealPitchShift,
  sidebarWidth,
  timeWindow,
  transposeFrame,
  TRANSPOSE_MS,
} from "./EditorViewport";

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
  const { uncoveredTimeFraction } = await import("./EditorViewport");
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
it("eases a transposition out while the notes briefly lead toward the target", () => {
  expect(transposeFrame(0, -12, 0, 0.5)).toEqual({ shift: 0, lead: -0, done: false });
  const third = transposeFrame(0, -12, TRANSPOSE_MS / 3, 0.5);
  expect(third.shift).toBeLessThan(-6);
  expect(third.lead).toBeCloseTo(-0.5);
  expect(transposeFrame(0, 12, TRANSPOSE_MS / 3, 0.5).lead).toBeCloseTo(0.5);
  expect(transposeFrame(0, -12, TRANSPOSE_MS, 0.5)).toEqual({ shift: -12, lead: -0, done: true });
});

it("fits ascending and descending contours including their target after octave transposition", () => {
  const note = {
    midi: 72,
    name: "C5",
    start: 0,
    duration: 1,
    bend: {
      glide: 1,
      points: [
        { position: 0, offset: -24 },
        { position: 0.5, offset: 12 },
        { position: 1, offset: 0 },
      ],
    },
  };
  expect(fittedPitch([note])).toEqual({ midiMin: 46, midiMax: 86 });
  expect(fittedPitch([{ ...note, midi: 84 }])).toEqual({ midiMin: 58, midiMax: 98 });
  expect(fittedPitch([{ ...note, bend: { ...note.bend, glide: 0 } }])).toEqual({
    midiMin: 70,
    midiMax: 76,
  });
});
it("fits the entire selected bend above a phone inspector", () => {
  const range = { midiMin: 51, midiMax: 84 };
  const target = pitchAboveSheet(range, { midiMin: 53, midiMax: 82 }, 0.42);
  const span = (range.midiMax - range.midiMin) / target.zoom;
  const center = (range.midiMax + range.midiMin) / 2 + target.pan;
  const top = center + span / 2;
  expect(top).toBeGreaterThan(82);
  expect((top - 53) / span).toBeLessThanOrEqual(0.58);
});
