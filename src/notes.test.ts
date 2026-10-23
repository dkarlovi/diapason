import { expect, it } from "vitest";
import { segmentNotes, type Frame, type NoteEvent, type SegmentOptions } from "./notes";
const repeat = (pitch: number | null, count: number) => Array<number | null>(count).fill(pitch);
function frames(pitches: (number | null)[]): Frame[] {
  return pitches.map((midi, i) => ({
    t: i * 0.02,
    freq: midi === null ? null : 440 * 2 ** ((midi - 69) / 12),
    clarity: 0.99,
    rms: 0.1,
  }));
}
function events(pitches: (number | null)[], opts: SegmentOptions = {}) {
  return segmentNotes(frames(pitches), { medianWindow: 1, ...opts });
}
function match(actual: NoteEvent[], expected: [number, string, number, number][]) {
  expect(actual).toHaveLength(expected.length);
  for (const [i, [midi, name, start, duration]] of expected.entries()) {
    expect(actual[i]).toMatchObject({ midi, name });
    expect(actual[i]!.start).toBeCloseTo(start, 10);
    expect(actual[i]!.duration).toBeCloseTo(duration, 10);
  }
}
it("drops empty, unvoiced and below-gate frames but accepts exact gate values", () => {
  expect(segmentNotes([])).toEqual([]);
  expect(events(repeat(null, 20))).toEqual([]);
  for (const patch of [{ rms: 0.0029 }, { clarity: 0.899 }]) {
    expect(segmentNotes(frames(repeat(69, 10)).map((f) => ({ ...f, ...patch })))).toEqual([]);
  }
  match(segmentNotes(frames(repeat(69, 5)).map((f) => ({ ...f, rms: 0.003, clarity: 0.9 }))), [
    [69, "A4", 0, 0.08],
  ]);
});
it("closes the final note at its last frame and drops notes shorter than minimum", () => {
  expect(events(repeat(69, 4))).toEqual([]);
  match(events(repeat(69, 5)), [[69, "A4", 0, 0.08]]);
});
it("median-smooths isolated jitter without changing input frames", () => {
  const input = frames([...repeat(69, 8), 76, ...repeat(69, 8)]);
  const before = structuredClone(input);
  match(segmentNotes(input), [[69, "A4", 0, 0.32]]);
  expect(input).toEqual(before);
});
it("rejects a brief pitch change but accepts a persistent one at its attack", () => {
  match(events([...repeat(69, 10), ...repeat(72, 2), ...repeat(69, 10)]), [[69, "A4", 0, 0.42]]);
  match(events([...repeat(69, 10), ...repeat(72, 10)]), [
    [69, "A4", 0, 0.2],
    [72, "C5", 0.2, 0.18],
  ]);
});
it("keeps pitch inside the hysteresis deadband and splits after escape", () => {
  match(events([...repeat(69, 15), ...repeat(69.8, 10)]), [[69, "A4", 0, 0.48]]);
  match(events([...repeat(69, 15), ...repeat(70.01, 10)]), [
    [69, "A4", 0, 0.3],
    [70, "A#4", 0.3, 0.18],
  ]);
});
it("bridges short silence and preserves same-pitch rearticulation after a real gap", () => {
  match(events([...repeat(69, 5), ...repeat(null, 2), ...repeat(69, 5)]), [[69, "A4", 0, 0.22]]);
  match(events([...repeat(69, 5), ...repeat(null, 5), ...repeat(69, 6)]), [
    [69, "A4", 0, 0.08],
    [69, "A4", 0.2, 0.1],
  ]);
});
it("merges adjacent relabeled events whose median pitches agree", () => {
  match(
    events([...repeat(69, 10), ...repeat(70.1, 3), ...repeat(69.4, 10)], {
      changeDebounceSec: 0.04,
    }),
    [[69, "A4", 0, 0.44]],
  );
});
it("resets a pending candidate when the original note resumes", () => {
  match(events([...repeat(69, 5), ...repeat(72, 2), ...repeat(69, 2), ...repeat(72, 6)]), [
    [69, "A4", 0, 0.18],
    [72, "C5", 0.18, 0.1],
  ]);
});
