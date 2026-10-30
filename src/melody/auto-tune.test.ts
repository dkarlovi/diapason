// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import moon from "../fixtures/whistle-moon/interpretation.json";
import { loadFixture } from "../test-support/fixtures";
import { noteRecording } from "../test-support/note-recording";
import { recording } from "../test-support/recording";
import { processRecording } from "../recording";
import { noteSourceFromAnalysis } from "../note-source";
import { PRESETS, resolveKnobs, type PresetId } from "./knobs";

const fixtureNames = ["whistle-intro", "whistle-regression", "whistle-take2"] as const;

it.each(Object.keys(PRESETS) as PresetId[])(
  "identical controls produce the same correction under %s",
  (preset) => {
    const controls = { ...resolveKnobs("auto-tune", {}), contextCorrection: 1 };
    const record = moonRecord(preset);
    const result = processRecording(
      { ...record, melody: { ...record.melody, overrides: controls } },
      [],
    );
    expect(result.notes.map((n) => n.midi)).toEqual(moon.contextual);
    const reference = moonRecord("auto-tune");
    expect(result.notes).toEqual(
      processRecording({ ...reference, melody: { ...reference.melody, overrides: controls } }, [])
        .notes,
    );
  },
);

it("disabling Context correction restores legacy scoring even under Auto tune", () => {
  const record = moonRecord();
  const result = processRecording(
    { ...record, melody: { ...record.melody, overrides: { contextCorrection: 0 } } },
    [],
  );
  expect(result.notes.map((n) => n.midi)).toEqual(moon.automatic);
});

function moonRecord(preset: PresetId = "auto-tune") {
  const knobs = resolveKnobs("clean", {});
  return {
    ...noteRecording(),
    bpm: moon.timing.bpm,
    beatsPerBar: moon.timing.beatsPerBar,
    durationSec: 17,
    noteSource: {
      version: 1 as const,
      interpretationVersion: 1 as const,
      range: moon.range,
      segments: moon.segments,
      frozenDetection: {
        steadiness: knobs.steadiness,
        minNoteMs: knobs.minNoteMs,
        silenceGapMs: knobs.silenceGapMs,
        levelGate: knobs.levelGate,
      },
    },
    melody: { preset, key: "auto" as const, overrides: {} },
  };
}

it("recovers six explicit Moon corrections without changing other pitches or segment boundaries", () => {
  const result = processRecording(moonRecord(), []);
  expect(result.notes.map((n) => n.midi)).toEqual(moon.contextual);
  expect(
    result.items.filter((item, i) => item.note.midi !== moon.automatic[i]).map((item) => item.id),
  ).toEqual([5, 7, 9, 13, 14, 25]);
  expect(result.interpretation.segments).toEqual(moon.segments);
  expect(result.items[10]!.note.name).toBe("G6"); // Glide handling is deferred.
  expect(result.items.slice(26, 28).map((item) => item.note.name)).toEqual(["D#6", "D#6"]);
  expect(result.items.every((item) => item.editState.axes.length === 0)).toBe(true);
});

it("leaves existing Clean interpretation unchanged", () => {
  expect(processRecording(moonRecord("clean"), []).notes.map((n) => n.midi)).toEqual(
    moon.automatic,
  );
});

it("uses existing sliders to turn off added scale and melodic correction", () => {
  const record = moonRecord();
  const overrides = { keyPull: 0, leapPenalty: 0, grid: 0 as const };
  const tuned = processRecording({ ...record, melody: { ...record.melody, overrides } }, []);
  const plain = processRecording(
    {
      ...record,
      melody: {
        ...record.melody,
        preset: "clean" as const,
        overrides: { ...overrides, grid: 0 as const },
      },
    },
    [],
  );
  expect(tuned.notes).toEqual(plain.notes);
});

describe.each(fixtureNames)("%s real-audio interpretation", (name) => {
  let fixture: ReturnType<typeof loadFixture>;
  beforeAll(() => {
    // Full WAV pitch analysis is setup, separate from the assertion budget.
    // Coverage on CI makes this work substantially slower.
    fixture = loadFixture(name);
  }, 60000);
  it("preserves the listened-to candidate pitches with live audio and fixed sources", () => {
    const record = {
      ...fixture.record,
      melody: { preset: "auto-tune" as PresetId, key: "auto" as const, overrides: {} },
    };
    const result = processRecording(record, fixture.frames);
    const expected = {
      "whistle-intro": [87, 91, 92, 89, 87, 89, 91, 87, 86, 87, 89, 86, 84, 86],
      "whistle-regression": [
        85, 87, 90, 92, 89, 89, 90, 87, 87, 89, 87, 87, 87, 87, 90, 92, 92, 90, 90, 90, 87, 89, 87,
        90, 87,
      ],
      "whistle-take2": [
        86, 87, 90, 90, 91, 88, 90, 88, 91, 88, 88, 90, 87, 88, 91, 91, 93, 90, 90, 91, 86, 87, 90,
        87,
      ],
    }[name];
    expect(result.notes.map((n) => n.midi)).toEqual(expected);
    const fixed = {
      ...noteRecording(),
      durationSec: record.durationSec,
      bpm: record.bpm,
      beatsPerBar: record.beatsPerBar,
      melody: record.melody,
      noteSource: noteSourceFromAnalysis(record, fixture.frames, result.interpretation.segments),
    };
    expect(processRecording(fixed, []).notes).toEqual(result.notes);
    const clean = processRecording(
      { ...record, melody: { ...record.melody, preset: "clean" as const } },
      fixture.frames,
    );
    expect(result.notes.map((n) => [n.start, n.duration])).toEqual(
      clean.notes.map((n) => [n.start, n.duration]),
    );
  }, 15000);
});

it("can reduce scale and melodic correction independently", () => {
  const record = moonRecord();
  const keyOff = processRecording(
    { ...record, melody: { ...record.melody, overrides: { keyPull: 0 } } },
    [],
  );
  expect(keyOff.items[4]!.note.midi).toBe(87);
  const smoothOff = processRecording(
    { ...record, melody: { ...record.melody, overrides: { leapPenalty: 0 } } },
    [],
  );
  // Without the melodic prior, 92.398 minus tuning is nearer A6 than G6
  // among the natural-scale candidates.
  expect(smoothOff.items[8]!.note.midi).toBe(93);
});

it("has no notes or invented key for silence", () => {
  const record = {
    ...recording(),
    melody: { preset: "auto-tune" as const, key: "auto" as const, overrides: {} },
  };
  const result = processRecording(record, []);
  expect(result.notes).toEqual([]);
  expect(result.interpretation.key.chosen).toBeNull();
});
