// @vitest-environment node
import { expect, it } from "vitest";
import { loadFixture } from "../tests/support/fixtures";
import { PRESETS } from "./melody/knobs";
import { interpretMelody, interpretSegments } from "./melody/interpret";
import { noteSourceFromAnalysis, validateNoteSource } from "./note-source";
import { processRecording } from "./recording";
const take = loadFixture("whistle-intro");
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
