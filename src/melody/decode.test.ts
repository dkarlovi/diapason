// @vitest-environment node
import { expect, it } from "vitest";
import { freqToMidi, type Frame } from "../notes";
import { loadFixture } from "../test-support/fixtures";
import { PRESETS } from "./knobs";
import { decodeMelody, type PitchContext } from "./decode";
const take1 = loadFixture("whistle-regression");
const take2 = loadFixture("whistle-take2");
const context: PitchContext = {
  key: null,
  harmony: [],
  range: { minMidi: freqToMidi(250), maxMidi: freqToMidi(3000) },
};
const gentle = PRESETS.gentle.knobs;
function frames(parts: [number, number | null][]): Frame[] {
  const result: Frame[] = [];
  for (const [duration, midi] of parts)
    for (let i = 0; i < Math.round((duration * 48000) / 512); i++)
      result.push({
        t: (result.length * 512) / 48000,
        freq: midi === null ? null : 440 * 2 ** ((midi - 69) / 12),
        clarity: 0.99,
        rms: 0.1,
      });
  return result;
}
it("holds a vibrato note as one note", () => {
  const input = frames([[1, 76]]).map((f) => ({
    ...f,
    freq: 440 * 2 ** ((76 + 0.4 * Math.sin(2 * Math.PI * 6 * f.t) - 69) / 12),
  }));
  expect(decodeMelody(input, gentle, context).map((n) => n.midi)).toEqual([76]);
});
it("absorbs a glide shorter than slipMs", () => {
  const input = frames([
    [0.5, 79],
    [0.1, 79.51],
    [0.5, 79],
  ]);
  expect(decodeMelody(input, { ...gentle, slipMs: 150 }, context).map((n) => n.midi)).toEqual([79]);
  expect(decodeMelody(input, { ...gentle, slipMs: 0, stickiness: 0 }, context)).toHaveLength(3);
});
it("keeps a deliberate leap and repeated pitches separated by real silence", () => {
  expect(
    decodeMelody(
      frames([
        [0.4, 72],
        [0.4, 79],
      ]),
      gentle,
      context,
    ).map((n) => n.midi),
  ).toEqual([72, 79]);
  expect(
    decodeMelody(
      frames([
        [0.3, 76],
        [0.12, null],
        [0.3, 76],
      ]),
      { ...gentle, silenceGapMs: 90 },
      context,
    ).map((n) => n.midi),
  ).toEqual([76, 76]);
});
it("decodes pitches at the profile range edges", () => {
  expect(
    decodeMelody(
      frames([
        [0.4, freqToMidi(250)],
        [0.4, freqToMidi(3000)],
      ]),
      gentle,
      context,
    ).map((n) => n.midi),
  ).toEqual([59, 102]);
});
it("key prior resolves an ambiguous note toward the key", () => {
  const input = frames([[0.5, 77.49]]);
  const keyed = { ...context, key: { tonic: 4, mode: "minor" as const } };
  expect(decodeMelody(input, { ...gentle, keyPull: 0.8 }, keyed)[0]!.midi).toBe(78);
  expect(decodeMelody(input, { ...gentle, keyPull: 0 }, keyed)[0]!.midi).toBe(77);
});
it("never moves a note further than maxMoveSemitones", () => {
  expect(
    decodeMelody(
      frames([[0.5, 77.05]]),
      { ...gentle, keyPull: 1, maxMoveSemitones: 0 },
      { ...context, key: { tonic: 4, mode: "minor" } },
    )[0]!.midi,
  ).toBe(77);
});
it("faithful take 1 preserves an ordered monophonic performance", () => {
  const notes = decodeMelody(take1.frames, PRESETS["as-played"].knobs, context);
  // Take 1's pitches wander by up to half a semitone, so exact labels are not
  // pinned here; the intro fixture carries the exact-melody regression.
  expect(notes.length).toBeGreaterThan(0);
  notes.forEach((note, i) => {
    expect(note.start).toBeGreaterThanOrEqual(0);
    expect(note.duration).toBeGreaterThanOrEqual(0.08);
    expect(note.start + note.duration).toBeLessThanOrEqual(take1.record.durationSec);
    if (i)
      expect(notes[i - 1]!.start + notes[i - 1]!.duration).toBeLessThanOrEqual(note.start + 1e-12);
  });
});
it("absorbs the take-2 slip with gentle settings", () => {
  const notes = decodeMelody(take2.frames, gentle, {
    ...context,
    key: { tonic: 4, mode: "minor" },
  });
  expect(notes.filter((n) => n.start > 13.5 && n.start < 16.6 && n.duration < 0.15)).toEqual([]);
  expect(notes.find((n) => n.start <= 16.05 && n.start + n.duration >= 16.05)?.midi).toBe(91);
});
it("is deterministic", () => {
  expect(decodeMelody(take2.frames, gentle, context)).toEqual(
    decodeMelody(take2.frames, gentle, context),
  );
});

it.each(["gentle", "clean", "keep-odd"] as const)(
  "settles wide involuntary vibrato into one straight note under %s",
  (preset) => {
    const input = frames([[2, 76]]).map((frame) => ({
      ...frame,
      freq: 440 * 2 ** ((76 + 0.8 * Math.sin(2 * Math.PI * 4 * frame.t) - 69) / 12),
    }));
    const notes = decodeMelody(input, PRESETS[preset].knobs, {
      ...context,
      key: { tonic: 4, mode: "minor" },
    });
    expect(notes.map((note) => note.midi)).toEqual([76]);
    expect(notes[0]!.start).toBe(0);
    expect(notes[0]!.duration).toBeGreaterThan(1.95);
  },
);
it("absorbs a short unstable attack through an intermediate fragment", () => {
  const notes = decodeMelody(
    frames([
      [0.12, 90],
      [0.025, 89],
      [0.6, 88],
    ]),
    gentle,
    context,
  );
  expect(notes.map((note) => note.midi)).toEqual([88]);
  expect(notes[0]!.start).toBe(0);
  expect(notes[0]!.duration).toBeGreaterThan(0.7);
});
it("keeps sustained intentional semitone steps", () => {
  const notes = decodeMelody(
    frames([
      [0.5, 76],
      [0.5, 77],
      [0.5, 76],
    ]),
    PRESETS.clean.knobs,
    context,
  );
  expect(notes.map((note) => note.midi)).toEqual([76, 77, 76]);
});
