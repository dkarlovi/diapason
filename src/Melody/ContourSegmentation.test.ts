// @vitest-environment node
import { expect, it } from "vitest";
import { contourFrames } from "../../tests/support/contours";
import { findContourParts, extractPitchContour } from "./ContourSegmentation";
import { loadFixture } from "../../tests/support/fixtures";
import { segmentMelody } from "./Decode";
import { PRESETS } from "./Knobs";
const moon = loadFixture("whistle-moon");
const pitches = (values: number[]) => values;
it("keeps clean 128ms chromatic steps instead of absorbing short notes", () => {
  const raw = [...Array(12).fill(76), ...Array(12).fill(77), ...Array(12).fill(78)];
  expect(findContourParts(raw, 8, 0.6).map((p) => [p.start, p.end, Math.round(p.pitch)])).toEqual([
    [0, 12, 76],
    [12, 24, 77],
    [24, 36, 78],
  ]);
});
it.each([1, -1])("attaches a connecting slide to its destination in direction %d", (direction) => {
  const raw = [
    ...Array(47).fill(76),
    ...Array.from({ length: 28 }, (_, i) => 76 + (direction * 7 * i) / 27),
    ...Array(47).fill(76 + direction * 7),
  ];
  const parts = findContourParts(raw, 8, 0.6);
  expect(parts).toHaveLength(2);
  expect(parts.map((p) => Math.round(p.pitch))).toEqual([76, 76 + direction * 7]);
  expect(parts[0]!.end).toBeLessThanOrEqual(50);
  const part = parts[1]!;
  expect(
    (extractPitchContour(raw.slice(part.start, part.end), part.pitch, 0.6)?.[0]?.offset ?? 0) *
      direction,
  ).toBeLessThan(-5);
});
it("anchors small monotonic drift near the held onset and suppresses its bend", () => {
  const raw = pitches(Array.from({ length: 94 }, (_, i) => 76 + i / 93));
  const parts = findContourParts(raw, 8, 0.6);
  expect(parts).toHaveLength(1);
  expect(parts[0]!.pitch).toBeLessThan(76.15);
  expect(extractPitchContour(raw, parts[0]!.pitch, 0.6)).toBeUndefined();
});
it("keeps wide vibrato whole without turning it into an intentional glide", () => {
  const raw = Array.from(
    { length: 188 },
    (_, i) => 76 + 0.8 * Math.sin((2 * Math.PI * 4 * i * 512) / 48000),
  );
  const parts = findContourParts(raw, 8, 0.6);
  expect(parts).toHaveLength(1);
  expect(parts[0]!.pitch).toBeCloseTo(76, 1);
  expect(extractPitchContour(raw, parts[0]!.pitch, 0.6)).toBeUndefined();
});
it("holds a continuous broad glide with no plateau as one destination note", () => {
  const raw = Array.from({ length: 122 }, (_, i) => 72 + (7 * i) / 121);
  const parts = findContourParts(raw, 8, 0.6);
  expect(parts).toHaveLength(1);
  expect(parts[0]!.pitch).toBeGreaterThan(78.5);
});
it.each([1, -1])(
  "keeps slow connecting movement attached to its destination in direction %d",
  (direction) => {
    const raw = [
      ...Array(30).fill(72),
      ...Array.from({ length: 201 }, (_, i) => 72 + direction * i * 0.02),
      ...Array(30).fill(72 + direction * 4),
    ];
    const parts = findContourParts(raw, 5, 0.5);
    expect(parts).toHaveLength(2);
    expect(parts.map((part) => Math.round(part.pitch))).toEqual([72, 72 + direction * 4]);
    expect(parts[0]!.end).toBeLessThan(50);
    expect(parts[1]!.start).toBe(parts[0]!.end);
    const destination = parts[1]!;
    const contour = extractPitchContour(raw.slice(destination.start), destination.pitch, 0.5);
    expect(contour![0]!.offset * direction).toBeLessThan(-3);
  },
);
it("anchors a slow broad glide without a plateau at its destination", () => {
  const raw = Array.from({ length: 201 }, (_, i) => 72 + i * 0.02);
  const parts = findContourParts(raw, 5, 0.5);
  expect(parts).toHaveLength(1);
  expect(parts[0]!.pitch).toBeGreaterThan(75.8);
});
it("uses the reviewed Moon 10/11 passage as one F#6 under opt-in interpretation3", () => {
  const segments = segmentMelody(moon.frames, { ...PRESETS.clean.knobs, glide: 1 }, [], 3);
  const held = segments.find((s) => s.source.start <= 4.1 && s.source.end >= 4.5);
  expect(held).toBeDefined();
  expect(Math.round(held!.pitch - 0.21), JSON.stringify(held)).toBe(90);
  expect(held!.source.start).toBeCloseTo(4.032, 1);
  expect(held!.source.end).toBeCloseTo(5.013333333333334, 1);
  expect(held!.curve).toBeUndefined();
});
it("respects articulation and protected source boundaries in v3", () => {
  const frames = contourFrames([
    { kind: "hold", frames: 47, midi: 76 },
    { kind: "hold", frames: 1, midi: 76, rms: 0.03 },
    { kind: "hold", frames: 46, midi: 76 },
  ]);
  expect(segmentMelody(frames, { ...PRESETS.clean.knobs, glide: 1 }, [], 3)).toHaveLength(2);
  const flat = contourFrames([{ kind: "hold", frames: 94, midi: 76 }]);
  expect(segmentMelody(flat, { ...PRESETS.clean.knobs, glide: 1 }, [flat[47]!.t], 3)).toHaveLength(
    2,
  );
});

it("distinguishes attack flutter from equally deep repeated articulations", () => {
  const make = (second: number) =>
    contourFrames([
      { kind: "hold", frames: 47, midi: 76 },
      { kind: "hold", frames: 1, midi: 76, rms: 0.004 },
      { kind: "hold", frames: 11, midi: 76 },
      { kind: "hold", frames: 1, midi: 76, rms: second },
      { kind: "hold", frames: 50, midi: 76 },
    ]);
  expect(segmentMelody(make(0.018), { ...PRESETS.clean.knobs, glide: 1 }, [], 3)).toHaveLength(2);
  expect(segmentMelody(make(0.004), { ...PRESETS.clean.knobs, glide: 1 }, [], 3)).toHaveLength(3);
  expect(
    segmentMelody(make(0.018), { ...PRESETS.clean.knobs, glide: 1, steadiness: 0 }, [], 3),
  ).toHaveLength(3);
});
