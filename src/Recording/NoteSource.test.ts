// @vitest-environment node
import { expect, it } from "vitest";
import { loadFixture } from "../../tests/support/fixtures";
import { PRESETS } from "../Melody/Knobs";
import { interpretMelody, interpretSegments } from "../Melody/Interpret";
import { noteSourceFromAnalysis, validateNoteSource } from "./NoteSource";
import { processRecording } from "./Processing";
const take = loadFixture("whistle-intro");
it("accepts valid curves only in interpretation 3", () => {
  const source = noteSourceFromAnalysis(take.record, take.frames);
  source.segments[0]!.curve = [
    { position: 0, offset: -2 },
    { position: 1, offset: 0 },
  ];
  expect(() => validateNoteSource(source, take.record.durationSec)).toThrow();
  source.interpretationVersion = 3;
  expect(validateNoteSource(source, take.record.durationSec)).toBe(source);
  source.segments[0]!.curve[1]!.offset = 1;
  expect(() => validateNoteSource(source, take.record.durationSec)).toThrow();
});
it("captures v3 automatic curves while retaining manually protected source segments", () => {
  const record = {
    ...take.record,
    melody: { preset: "as-played" as const, key: "auto" as const, overrides: { glide: 0.7 } },
  };
  const first = processRecording(record, take.frames).interpretation.segments[0]!;
  const curve = [
    { position: 0, offset: -3 },
    { position: 1, offset: 0 },
  ];
  const segment = { ...first, curve };
  const edited = {
    ...record,
    noteEdits: { version: 1 as const, pitch: [], bend: [{ id: "bend", segment, points: curve }] },
  };
  const source = noteSourceFromAnalysis(edited, take.frames);
  expect(source.interpretationVersion).toBe(3);
  expect(source.segments[0]).toEqual(segment);
  expect(source.segments).toEqual(processRecording(edited, take.frames).interpretation.segments);
});
it.each(Object.keys(PRESETS) as (keyof typeof PRESETS)[])(
  "fixed segments preserve %s interpretation",
  (preset) => {
    const record = { ...take.record, melody: { preset, overrides: {}, key: "auto" as const } };
    const source = noteSourceFromAnalysis(record, take.frames);
    const input = {
      knobs: PRESETS[preset].knobs,
      key: "auto" as const,
      timing: { bpm: record.bpm, beatsPerBar: record.beatsPerBar },
      range: source.range,
    };
    expect(interpretSegments(source.segments, input)).toEqual(interpretMelody(take.frames, input));
    expect(validateNoteSource(source, record.durationSec)).toEqual(source);
  },
);
it("retains protected edit boundaries and muted segments", () => {
  const initial = processRecording(take.record, take.frames);
  const first = initial.items[0]!;
  const record = {
    ...take.record,
    noteEdits: { version: 1 as const, pitch: [{ id: "edit", ranges: [first.source], midi: 60 }] },
    muted: [{ t: first.raw.start + first.raw.duration / 2, midi: first.raw.midi }],
  };
  const source = noteSourceFromAnalysis(record, take.frames);
  expect(source.segments).toEqual(processRecording(record, take.frames).interpretation.segments);
  expect(source.segments.length).toBeGreaterThan(0);
  expect(() =>
    validateNoteSource(
      { ...source, segments: [{ ...source.segments[0], pitch: NaN }] },
      record.durationSec,
    ),
  ).toThrow();
});
