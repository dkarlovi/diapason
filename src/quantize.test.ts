import { expect, it } from "vitest";
import { quantizeNotes } from "./quantize";
import reference from "./fixtures/whistle-regression/reference.json";
import { midiToName, type NoteEvent } from "./notes";

const note = (midi: number, start: number, duration: number): NoteEvent => ({
  midi,
  name: midiToName(midi),
  start,
  duration,
});

it("retains distinct short notes when a coarse grid collapses their onsets", () => {
  const input = [note(60, 0.1, 0.08), note(62, 0.2, 0.08)];
  expect(quantizeNotes(input, { bpm: 120, subdivision: 1 })).toEqual(input);
});

it("does not turn a short note into an entire grid cell", () => {
  expect(quantizeNotes([note(60, 0.1, 0.08)], { bpm: 120, subdivision: 1 })).toEqual([
    note(60, 0, 0.08),
  ]);
});

it.each([1, 2, 3, 4])("keeps the real melody monophonic on subdivision %i", (subdivision) => {
  const input = reference.map((n) => note(n.midi, n.start, n.duration));
  const output = quantizeNotes(input, { bpm: 95, subdivision });
  expect(output.map((n) => n.midi)).toEqual(reference.map((n) => n.midi));
  expect(input).toEqual(reference.map((n) => note(n.midi, n.start, n.duration)));
  for (let i = 0; i < output.length; i++) {
    expect(output[i]!.duration).toBeGreaterThan(0);
    if (i)
      expect(output[i - 1]!.start + output[i - 1]!.duration).toBeLessThanOrEqual(
        output[i]!.start + 1e-10,
      );
  }
});

it("preserves grid aligned articulation and rests, including repeated pitches", () => {
  const input = [note(60, 0, 0.5), note(60, 0.5, 0.25), note(62, 1, 0.25)];
  expect(quantizeNotes(input, { bpm: 120, subdivision: 2 })).toEqual(input);
  expect(quantizeNotes([], { bpm: 120, subdivision: 1 })).toEqual([]);
  expect(quantizeNotes(input, { bpm: 0, subdivision: 1 })).toEqual(input);
});
