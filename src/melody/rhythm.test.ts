import { expect, it } from "vitest";
import { applyFeel } from "./rhythm";
import { PRESETS, type GridSubdivision } from "./knobs";
const neutral = {
  ...PRESETS.gentle.knobs,
  grid: 0 as const,
  swing: 0,
  syncopation: 0,
  articulation: 1,
};
const timing = { bpm: 120, beatsPerBar: 4 };
const note = (start: number, duration = 0.4) => ({ midi: 60, name: "C4", start, duration });
it("is the identity when grid is off and feel knobs are neutral", () => {
  const notes = [note(0.27), note(1.1)];
  expect(applyFeel(notes, neutral, timing)).toEqual(notes);
});
it("gridPull interpolates between sung and snapped onsets", () => {
  expect(
    applyFeel([note(0.27)], { ...neutral, grid: 2, gridPull: 1 }, timing)[0]!.start,
  ).toBeCloseTo(0.25);
  expect(
    applyFeel([note(0.27)], { ...neutral, grid: 2, gridPull: 0.5 }, timing)[0]!.start,
  ).toBeCloseTo(0.26);
});
it("swing delays off-beat grid onsets only", () => {
  const notes = applyFeel(
    [note(0.25, 0.1), note(0.5)],
    { ...neutral, grid: 2, gridPull: 1, swing: 0.33 },
    timing,
  );
  expect(notes[0]!.start).toBeCloseTo(0.3325);
  expect(notes[1]!.start).toBe(0.5);
});
it("syncopation anticipates some on-beat onsets by one subdivision", () => {
  const notes = applyFeel(
    Array.from({ length: 8 }, (_, i) => note(i * 0.5)),
    { ...neutral, grid: 2, gridPull: 1, syncopation: 1 },
    timing,
  );
  expect(
    notes.filter((n) => Math.abs(((n.start / 0.25) % 2) - 1) < 0.001).length,
  ).toBeGreaterThanOrEqual(2);
  expect(notes).toHaveLength(8);
});
it("articulation shortens or extends without overlapping the next onset", () => {
  expect(applyFeel([note(0)], { ...neutral, articulation: 0.5 }, timing)[0]!.duration).toBe(0.2);
  const notes = applyFeel([note(0, 0.5), note(0.55)], { ...neutral, articulation: 1.2 }, timing);
  expect(notes[0]!.duration).toBe(0.55);
  expect(notes[1]!.duration).toBeCloseTo(0.48);
});
it.each([0, 1, 2, 3, 4] as GridSubdivision[])(
  "never reorders, drops or overlaps notes with grid %i",
  (grid) => {
    const original = [
      note(0.01, 0.2),
      note(0.08, 0.1),
      note(0.31, 0.1),
      note(0.52),
      note(0.78),
      note(0.83, 0.06),
      note(1.2),
    ];
    const notes = applyFeel(original, { ...neutral, grid, syncopation: 1, swing: 0.5 }, timing);
    expect(notes).toHaveLength(original.length);
    notes.forEach((n, i) => {
      expect(n.duration).toBeGreaterThan(0);
      expect(n.start).toBeGreaterThanOrEqual(0);
      if (i) {
        expect(n.start).toBeGreaterThan(notes[i - 1]!.start);
        expect(notes[i - 1]!.start + notes[i - 1]!.duration).toBeLessThanOrEqual(n.start + 1e-12);
      }
    });
  },
);
