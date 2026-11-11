// @vitest-environment node
import { expect, it } from "vitest";
import moon from "../../tests/fixtures/whistle-moon/interpretation.json";
import { loadFixture } from "../../tests/support/fixtures";
import { interpretMelody, interpretSegments } from "./Interpret";
import { PRESETS } from "./Knobs";
import { freqToMidi } from "./Notes";

it.each(["whistle-intro", "whistle-regression", "whistle-take2", "whistle-moon"] as const)(
  "v5 preserves zero/full-pull results on %s with Context correction off and on",
  (name) => {
    const take = name === "whistle-moon" ? null : loadFixture(name);
    const input = {
      knobs: PRESETS["as-played"].knobs,
      key: "auto" as const,
      timing: take ? { bpm: take.record.bpm, beatsPerBar: 4 } : moon.timing,
      range: take ? { minMidi: freqToMidi(250), maxMidi: freqToMidi(3000) } : moon.range,
    };
    const segments = take
      ? interpretMelody(take.frames, { ...input, version: 4 }).segments
      : moon.segments;
    for (const contextCorrection of [0, 1]) {
      for (const keyPull of [0, 1]) {
        const controls = {
          ...input,
          knobs: { ...input.knobs, keyPull, contextCorrection, leapPenalty: 0.1 },
        };
        const before = interpretSegments(segments, { ...controls, version: 4 });
        const after = interpretSegments(segments, { ...controls, version: 5 });
        expect(after).toEqual(before);
      }
    }
  },
  60_000,
);

it.each([0, 0.7])("v5 keeps v4 note detection at Glide %s", (glide) => {
  const frames = Array.from({ length: 200 }, (_, i) => {
    const pitch = 72 + 7 * Math.min(1, Math.max(0, (i - 30) / 120));
    return { t: i * 0.01, freq: 440 * 2 ** ((pitch - 69) / 12), clarity: 0.99, rms: 0.1 };
  });
  const input = {
    knobs: { ...PRESETS["as-played"].knobs, glide },
    key: "auto" as const,
    timing: { bpm: 120, beatsPerBar: 4 },
    range: { minMidi: freqToMidi(250), maxMidi: freqToMidi(3000) },
  };
  const before = interpretMelody(frames, { ...input, version: 4 }).segments;
  expect(before.some((segment) => segment.curve !== undefined)).toBe(glide > 0);
  expect(interpretMelody(frames, { ...input, version: 5 }).segments).toEqual(before);
});
