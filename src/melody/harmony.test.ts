import { expect, it } from "vitest";
import { inferHarmony } from "./harmony";
const key = { tonic: 0, mode: "major" as const };
const timing = { bpm: 120, beatsPerBar: 4 };
const note = (midi: number, start: number, duration = 0.5) => ({ midi, start, duration, name: "" });
it("chooses the diatonic triad covering the most note time per span", () => {
  const spans = inferHarmony(
    [note(60, 0), note(64, 0.5), note(67, 1, 1), note(62, 2), note(65, 2.5), note(69, 3, 1)],
    key,
    timing,
    "bar",
  );
  expect(spans.map((s) => [s.root, s.quality])).toEqual([
    [0, "maj"],
    [2, "min"],
  ]);
});
it("prefers the previous chord or the tonic when a span is ambiguous", () => {
  expect(
    inferHarmony(
      [note(60, 0), note(64, 0.5), note(67, 1, 1), note(64, 2, 2)],
      key,
      timing,
      "bar",
    ).map((s) => s.root),
  ).toEqual([0, 0]);
});
it("spans tile the notes' time range at the requested rate", () => {
  const spans = inferHarmony([note(60, 0.2, 1.7)], key, timing, "beat");
  expect(spans).toHaveLength(4);
  expect(spans[0]!.start).toBeLessThanOrEqual(0.2);
  expect(spans.at(-1)!.end).toBeGreaterThanOrEqual(1.9);
  spans.forEach((span, i) => {
    expect(span.end - span.start).toBe(0.5);
    if (i) expect(span.start).toBe(spans[i - 1]!.end);
  });
});
it("returns no spans for no notes", () => {
  expect(inferHarmony([], key, timing, "bar")).toEqual([]);
});
it("uses harmonic-minor V and natural-minor diatonic chords", () => {
  const spans = inferHarmony(
    [note(71, 0), note(75, 0.5), note(78, 1, 1)],
    { tonic: 4, mode: "minor" },
    timing,
    "bar",
  );
  expect(spans[0]).toMatchObject({ root: 11, quality: "maj", pitchClasses: new Set([11, 3, 6]) });
});
