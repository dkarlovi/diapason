// @vitest-environment node
import { expect, it } from "vitest";
import { isPitchCurve, notePitchAt, snapGlide, steppedNotes, bendSamples } from "./PitchCurve";
import type { NoteEvent } from "./Notes";

const points = [
  { position: 0, offset: -29 },
  { position: 0.32, offset: -12 },
  { position: 0.65, offset: -6 },
  { position: 0.82, offset: 0 },
  { position: 1, offset: 0 },
];
const note = (glide: number): NoteEvent => ({
  midi: 82,
  name: "A#5",
  start: 2,
  duration: 4.8,
  bend: { points, glide },
});
it("snaps the three discrete stops and retains the continuous smooth range", () => {
  expect([0, 0.09, 0.1, 0.29, 0.3, 0.39, 0.4, 0.41, 0.7, 1].map(snapGlide)).toEqual([
    0, 0, 0.2, 0.2, 0.4, 0.4, 0.4, 0.41, 0.7, 1,
  ]);
});
it("gives the smooth range an audible effect without moving point pitches or arrival times", () => {
  expect(notePitchAt(note(0.41), 0.2)).toBe(53);
  expect(notePitchAt(note(0.7), 0.2)).toBeCloseTo(56.7916238, 6);
  expect(notePitchAt(note(1), 0.2)).toBeCloseTo(64.62109375, 8);
  for (const glide of [0.41, 0.55, 0.7, 0.85, 1])
    for (const point of points)
      expect(notePitchAt(note(glide), point.position)).toBeCloseTo(82 + point.offset, 8);
});
it("applies the same timing to descending bends", () => {
  const up = note(0.7);
  const down = {
    ...up,
    midi: 53,
    bend: { ...up.bend!, points: points.map((p) => ({ ...p, offset: -p.offset })) },
  };
  for (const position of [0, 0.1, 0.2, 0.32, 0.5, 0.65, 0.82, 1])
    expect(notePitchAt(up, position) + notePitchAt(down, position)).toBeCloseTo(135, 8);
});
it("expands stepped output into contiguous fixed-pitch notes with preserved coverage", () => {
  const input: NoteEvent = {
    midi: 64,
    name: "E4",
    start: 1,
    duration: 2,
    bend: {
      glide: 0.4,
      points: [
        { position: 0, offset: -4 },
        { position: 1, offset: 0 },
      ],
    },
  };
  const steps = steppedNotes([input]);
  expect(steps.map((n) => n.midi)).toEqual([60, 61, 62, 63, 64]);
  expect(steps[0]!.start).toBe(1);
  expect(steps.at(-1)!.start + steps.at(-1)!.duration).toBeCloseTo(3, 8);
  steps.forEach((n, i) => {
    expect(n.bend).toBeUndefined();
    expect(n.duration).toBeGreaterThan(0);
    if (i) expect(steps[i - 1]!.start + steps[i - 1]!.duration).toBeCloseTo(n.start, 8);
  });
  expect(steppedNotes([note(1)])).toEqual([note(1)]);
});
it("bounds curve size and rejects malformed or unbounded pitch data", () => {
  expect(isPitchCurve(points)).toBe(true);
  for (const invalid of [
    [],
    points.slice(1),
    [...points, points[0]],
    [
      { position: 0, offset: 49 },
      { position: 1, offset: 0 },
    ],
    [
      { position: 0, offset: 0 },
      { position: 1, offset: 1 },
    ],
    [
      { position: 0, offset: NaN },
      { position: 1, offset: 0 },
    ],
  ])
    expect(isPitchCurve(invalid)).toBe(false);
});
it("samples endpoints and point arrivals without unbounded work on long notes", () => {
  const samples = bendSamples({ ...note(0.41), duration: 3600 });
  expect(samples.length).toBeLessThanOrEqual(322);
  expect(samples[0]).toEqual({ position: 0, offset: -29 });
  expect(samples.at(-1)).toEqual({ position: 1, offset: 0 });
  for (const point of points)
    expect(
      samples.some(
        (p) =>
          Math.abs(p.position - point.position) < 1e-9 && Math.abs(p.offset - point.offset) < 1e-8,
      ),
    ).toBe(true);
});
it.each([0.2, 0.4, 1])(
  "clips transposed bend output to the MIDI pitch range at Glide %s",
  (glide) => {
    const high: NoteEvent = {
      midi: 127,
      name: "G9",
      start: 0,
      duration: 1,
      bend: {
        glide,
        points: [
          { position: 0, offset: 4 },
          { position: 1, offset: 0 },
        ],
      },
    };
    const low: NoteEvent = {
      ...high,
      midi: 0,
      bend: {
        glide,
        points: [
          { position: 0, offset: -4 },
          { position: 1, offset: 0 },
        ],
      },
    };
    expect(notePitchAt(high, 0)).toBe(127);
    expect(notePitchAt(low, 0)).toBe(0);
    expect(steppedNotes([high]).every((n) => n.midi <= 127)).toBe(true);
    expect(steppedNotes([low]).every((n) => n.midi >= 0)).toBe(true);
  },
);
