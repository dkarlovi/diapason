import { expect, it } from "vitest";
import type { Recording } from "../Recording/Recording.type";
import { processRecording } from "../Recording/Processing";
import { resetPitchEdit, setPitchEdit, summarizePitchEdits } from "./NoteEdits";
const frames = Array.from({ length: 100 }, (_, i) => ({
  t: i * 0.01,
  freq: 440 * 2 ** (((i >= 40 && i < 52 ? 72.51 : 72) - 69) / 12),
  clarity: 0.99,
  rms: 0.05,
}));
const rec: Recording = {
  id: "edit",
  name: "Edit",
  createdAt: 0,
  sampleRate: 48000,
  durationSec: 1,
  bpm: 120,
  beatsPerBar: 4,
  audio: new Blob(),
  capture: { gain: 1, peak: 0.1, noiseFloor: 0, dspOff: true },
  melody: { preset: "as-played", key: "auto", overrides: { steadiness: 0 } },
};
it("inherits, partially resets, filters and restores intent without migration", () => {
  const whole = { start: 0, end: 1 };
  const parent = setPitchEdit(undefined, whole, 73, "parent");
  const split = processRecording({ ...rec, noteEdits: parent }, frames);
  expect(split.items).toHaveLength(3);
  expect(split.items.every((item) => item.note.midi === 73)).toBe(true);
  const left = split.items[0]!.source;
  const noteEdits = resetPitchEdit(parent, left);
  const saved = JSON.stringify(noteEdits);
  const high = { ...rec, noteEdits, melody: { ...rec.melody!, overrides: { steadiness: 1 } } };
  const result = processRecording(high, frames);
  expect(result.items[0]!.editState.axes).toEqual([]);
  expect(result.items[0]!.source.end).toBe(left.end);
  expect(result.items[1]!.note.midi).toBe(73);
  expect(
    processRecording({ ...high, melody: { ...high.melody, overrides: { levelGate: 0.1 } } }, frames)
      .editCoverage[0]?.status,
  ).toBe("inactive");
  expect(processRecording(high, frames)).toEqual(result);
  expect(JSON.stringify(noteEdits)).toBe(saved);
  expect(
    processRecording({ ...high, noteEdits: resetPitchEdit(noteEdits, whole) }, frames).notes,
  ).toEqual(processRecording({ ...high, noteEdits: { version: 1, pitch: [] } }, frames).notes);
});
it("retains equal-valued intent, mute state and exact names through timing/key changes", () => {
  const automatic = processRecording(rec, frames).items[0]!;
  const noteEdits = setPitchEdit(undefined, automatic.source, automatic.note.midi, "equal");
  const equal = processRecording({ ...rec, noteEdits }, frames).items[0]!;
  expect(equal.editState).toEqual({ ids: ["equal"], axes: ["pitch"], differingAxes: [] });
  const sharp = setPitchEdit(undefined, automatic.source, 73, "sharp");
  const edited = {
    ...rec,
    noteEdits: sharp,
    muted: [{ t: 0.2, midi: 72 }],
    melody: {
      ...rec.melody!,
      key: { tonic: 7, mode: "major" as const },
      overrides: { grid: 2 as const, swing: 0.7 },
    },
  };
  const result = processRecording(edited, frames);
  expect(result.items[0]).toMatchObject({ muted: true, note: { midi: 73, name: "C#5" } });
  expect(result.notes).not.toContainEqual(result.items[0]!.note);
  expect(processRecording({ ...rec, noteEdits: sharp }, []).editCoverage[0]?.status).toBe(
    "inactive",
  );
  expect(() =>
    processRecording({ ...rec, noteEdits: { ...sharp, version: 9 } as never }, frames),
  ).toThrow(/note edits/i);
});
it("subtracts represented intervals for active, partial and inactive coverage", () => {
  const edits = setPitchEdit(undefined, { start: 0, end: 3 }, 73, "a");
  expect(
    summarizePitchEdits(edits, [
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]),
  ).toEqual([{ id: "a", status: "partial", missing: [{ start: 1, end: 2 }] }]);
  expect(summarizePitchEdits(edits, [{ start: 0, end: 3 }])[0]?.status).toBe("active");
  expect(summarizePitchEdits(edits, [])[0]?.status).toBe("inactive");
});
it.each([73, 75])(
  "keeps independent neighboring targets at %s across tuning paths",
  (rightPitch) => {
    const a = setPitchEdit(undefined, { start: 0, end: 0.4 }, 73, "left");
    const noteEdits = setPitchEdit(a, { start: 0.4, end: 1 }, rightPitch, "right");
    const saved = JSON.stringify(noteEdits);
    const settings = [
      { preset: "clean" as const, key: "auto" as const, overrides: {} },
      { preset: "dreamy" as const, key: { tonic: 4, mode: "minor" as const }, overrides: {} },
      { preset: "syncopated" as const, key: "auto" as const, overrides: { steadiness: 1 } },
    ];
    const run = (melody: (typeof settings)[number]) =>
      processRecording({ ...rec, noteEdits, melody }, frames);
    const path = settings.map(run);
    expect(run(settings[2]!)).toEqual(path[2]);
    for (const result of path) {
      expect(result.items[0]).toMatchObject({ source: { start: 0, end: 0.4 }, note: { midi: 73 } });
      expect(result.items.slice(1).every((item) => item.note.midi === rightPitch)).toBe(true);
    }
    expect(JSON.stringify(noteEdits)).toBe(saved);
  },
);
