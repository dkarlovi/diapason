// @vitest-environment node
import { expect, it } from "vitest";
import { loadFixture } from "../../tests/support/fixtures";
import { freqToMidi, type NoteEvent } from "./Notes";
import { analyzeRecording } from "../Analysis/RecordingAnalysis";
import { PRESETS } from "./Knobs";
import { keyName } from "./Key";
import { interpretMelody, interpretSegments } from "./Interpret";
const take1 = loadFixture("whistle-regression");
const take2 = loadFixture("whistle-take2");
const input = {
  knobs: PRESETS.gentle.knobs,
  key: "auto" as const,
  timing: { bpm: 95, beatsPerBar: 4 },
  range: { minMidi: freqToMidi(250), maxMidi: freqToMidi(3000) },
};
// Edit distance between pitch sequences: how recognisable one tune is in another.
function agreement(a: NoteEvent[], b: NoteEvent[]): number {
  let previous = Int32Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1]!.midi === b[j - 1]!.midi ? 0 : 1),
      );
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}
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
it("auto key uses the faithful pass and mode forces the parallel mode", () => {
  const auto = interpretMelody(take2.frames, input);
  expect(auto.key.chosen).toEqual(auto.key.ranked[0]!.key);
  expect(keyName(auto.key.chosen!)).toBe("E minor");
  expect(
    keyName(
      interpretMelody(take2.frames, { ...input, knobs: { ...input.knobs, mode: "major" } }).key
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
it("exposes aligned source segments and respects protected boundaries", () => {
  const cut = take1.frames[100]!.t;
  const result = interpretMelody(take1.frames, { ...input, protectedBoundaries: [cut] });
  expect(result.segments).toHaveLength(result.notes.length);
  result.segments.forEach((s) => expect(s.source.start < cut && s.source.end > cut).toBe(false));
});

it.each([take1, take2])(
  "zero key pull preserves pitches across all explicit keys",
  (take) => {
    const knobs = { ...PRESETS["as-played"].knobs, contextCorrection: 1 };
    const auto = interpretMelody(take.frames, { ...input, knobs });
    for (let tonic = 0; tonic < 12; tonic++) {
      for (const mode of ["major", "minor"] as const) {
        const keyed = interpretSegments(auto.segments, { ...input, knobs, key: { tonic, mode } });
        expect(keyed.tuning).toBe(auto.tuning);
        expect(keyed.decoded).toEqual(auto.decoded);
      }
    }
  },
  30_000,
);

it.each([0, 0.5, 1])("key selection preserves performed tuning at pull %s", (keyPull) => {
  const knobs = { ...PRESETS["auto-pitch"].knobs, keyPull };
  const auto = interpretMelody(take2.frames, { ...input, knobs });
  const keyed = interpretMelody(take2.frames, {
    ...input,
    knobs,
    key: { tonic: 3, mode: "major" },
  });
  expect(keyed.tuning).toBe(auto.tuning);
});

it.each(["major", "minor"] as const)("an explicit key takes precedence over %s Mode", (mode) => {
  const key = { tonic: 4, mode: mode === "major" ? ("minor" as const) : ("major" as const) };
  const result = interpretMelody(take2.frames, { ...input, knobs: { ...input.knobs, mode }, key });
  expect(result.key).toMatchObject({ chosen: key, auto: false });
});

it.each([1, 2, 3] as const)(
  "retains saved interpretation %s key and tuning behavior",
  (version) => {
    const knobs = PRESETS["as-played"].knobs;
    const auto = interpretMelody(take2.frames, { ...input, knobs, version });
    const keyed = interpretMelody(take2.frames, {
      ...input,
      knobs,
      version,
      key: { tonic: 3, mode: "major" },
    });
    expect(keyed.tuning).toBeCloseTo(version === 3 ? -0.5 : 0.49, 2);
    expect(keyed.decoded.map((note) => note.midi)).not.toEqual(
      auto.decoded.map((note) => note.midi),
    );
    expect(
      interpretMelody(take2.frames, {
        ...input,
        version,
        knobs: { ...knobs, mode: "major" },
        key: { tonic: 4, mode: "minor" },
      }).key.chosen,
    ).toEqual({ tonic: 4, mode: "major" });
  },
);

it("zero key pull disables key-dependent chord correction even with Max pitch move enabled", () => {
  const pitches = [60, 61, 64, 67, 60, 61, 64, 67];
  const segments = pitches.map((pitch, start) => ({
    pitch,
    start,
    duration: 0.5,
    source: { start, end: start + 0.5 },
  }));
  for (const tonic of [0, 1]) {
    const result = interpretSegments(segments, {
      ...input,
      knobs: { ...PRESETS["as-played"].knobs, maxMoveSemitones: 2 },
      key: { tonic, mode: "major" },
    });
    expect(result.decoded.map((note) => note.midi)).toEqual(pitches);
  }
});
