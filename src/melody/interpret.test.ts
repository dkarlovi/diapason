// @vitest-environment node
import { expect, it } from "vitest";
import { loadFixture } from "../test-support/fixtures";
import { freqToMidi, type NoteEvent } from "../notes";
import { analyzeRecording } from "../recording-analysis";
import { PRESETS } from "./knobs";
import { keyName } from "./key";
import { agreement, interpretMelody } from "./interpret";
const take1 = loadFixture("whistle-regression");
const take2 = loadFixture("whistle-take2");
const input = {
  knobs: PRESETS.gentle.knobs,
  key: "auto" as const,
  timing: { bpm: 95, beatsPerBar: 4 },
  range: { minMidi: freqToMidi(250), maxMidi: freqToMidi(3000) },
};
it("silence yields no notes and no key", () => {
  const result = interpretMelody(
    Array.from({ length: 188 }, (_, i) => ({
      t: (i * 512) / 48000,
      freq: null,
      clarity: 0,
      rms: 0,
    })),
    input,
  );
  expect(result.notes).toEqual([]);
  expect(result.key).toMatchObject({ chosen: null, ranked: [] });
});
it("click-only input yields no notes and no key", () => {
  const pcm = Float32Array.from({ length: 96000 }, (_, i) => {
    const t = i / 48000,
      dt = t % 0.5;
    return dt < 0.015 ? 0.5 * Math.exp(-dt * 400) * Math.sin(2 * Math.PI * 1000 * t) : 0;
  });
  const result = interpretMelody(analyzeRecording(pcm, 48000, take1.record), input);
  expect(result.notes).toEqual([]);
  expect(result.key).toMatchObject({ chosen: null, ranked: [] });
});
it("as played equals the faithful pass", () => {
  const result = interpretMelody(take1.frames, { ...input, knobs: PRESETS["as-played"].knobs });
  expect(result.decoded).toEqual(result.faithful);
});
it("auto key uses the faithful pass and modeBias forces the parallel mode", () => {
  expect(keyName(interpretMelody(take1.frames, input).key.chosen!)).toBe("E minor");
  expect(
    keyName(
      interpretMelody(take1.frames, { ...input, knobs: { ...input.knobs, modeBias: 1 } }).key
        .chosen!,
    ),
  ).toBe("E major");
});
it("an explicit key is used and reported as not auto", () => {
  expect(
    interpretMelody(take1.frames, { ...input, key: { tonic: 0, mode: "major" } }).key,
  ).toMatchObject({ chosen: { tonic: 0, mode: "major" }, auto: false });
});
it("agreement counts edits between pitch sequences", () => {
  const notes = (pitches: number[]): NoteEvent[] =>
    pitches.map((midi, i) => ({ midi, name: "", start: i, duration: 1 }));
  expect(agreement(notes([60, 62, 64]), notes([60, 63, 64]))).toBe(1);
  expect(agreement(notes([60, 62, 64]), notes([60, 64]))).toBe(1);
  expect(agreement([], notes([60, 64]))).toBe(2);
  expect(agreement(notes([60, 64]), [])).toBe(2);
});
it.each(["gentle", "clean", "keep-odd"] as const)("absorbs the take-2 slip under %s", (preset) => {
  const result = interpretMelody(take2.frames, { ...input, knobs: PRESETS[preset].knobs });
  expect(result.notes.filter((n) => n.start > 13.5 && n.start < 16.6 && n.duration < 0.15)).toEqual(
    [],
  );
  expect(result.notes.find((n) => n.start <= 16.05 && n.start + n.duration >= 16.05)?.midi).toBe(
    91,
  );
});
it("happy uses a major key and sad a minor key", () => {
  expect(
    interpretMelody(take1.frames, { ...input, knobs: PRESETS.happy.knobs }).key.chosen?.mode,
  ).toBe("major");
  expect(
    interpretMelody(take1.frames, { ...input, knobs: PRESETS.sad.knobs }).key.chosen?.mode,
  ).toBe("minor");
});
it("dreamy keeps pitch movement controlled and connects note lengths", () => {
  const notes = (id: "dreamy" | "clean") =>
    interpretMelody(take1.frames, { ...input, knobs: PRESETS[id].knobs }).notes;
  const intervals = (ns: NoteEvent[]) =>
    ns.slice(1).reduce((sum, n, i) => sum + Math.abs(n.midi - ns[i]!.midi), 0) / (ns.length - 1);
  const gaps = (ns: NoteEvent[]) =>
    ns.slice(1).reduce((sum, n, i) => sum + n.start - ns[i]!.start - ns[i]!.duration, 0) /
    (ns.length - 1);
  expect(intervals(notes("dreamy"))).toBeLessThanOrEqual(intervals(notes("clean")));
  expect(gaps(notes("dreamy"))).toBeLessThan(gaps(notes("clean")));
});
it("syncopated puts onsets off the beat", () => {
  const notes = interpretMelody(take1.frames, { ...input, knobs: PRESETS.syncopated.knobs }).notes;
  const step = 60 / 95 / 2;
  notes.forEach((n) => expect(n.start / step).toBeCloseTo(Math.round(n.start / step), 7));
  expect(
    notes.filter((n) => Math.round(n.start / step) % 2 === 1).length / notes.length,
  ).toBeGreaterThanOrEqual(0.2);
});
it.each(["happy", "sad", "dreamy", "syncopated"] as const)(
  "%s keeps the tune recognisable",
  (id) => {
    const baseline = interpretMelody(take1.frames, { ...input, knobs: PRESETS.clean.knobs }).notes;
    const mood = interpretMelody(take1.frames, { ...input, knobs: PRESETS[id].knobs }).notes;
    expect(agreement(mood, baseline)).toBeLessThanOrEqual(0.35 * baseline.length);
  },
);
