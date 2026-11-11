// @vitest-environment node
import { expect, it } from "vitest";
import { notesFromSegments } from "./Decode";
import { PRESETS } from "./Knobs";
import type { PitchContext } from "./Decode.type";

const context: PitchContext = {
  key: { tonic: 0, mode: "major" },
  harmony: [],
  tuning: 0,
  meter: null,
  range: { minMidi: 48, maxMidi: 84 },
};
const segment = (pitch: number) => ({
  pitch,
  start: 0,
  duration: 1,
  source: { start: 0, end: 1 },
});

it.each([
  { keyPull: 0.25, below: 61.45, above: 61.46 },
  { keyPull: 0.5, below: 61.41, above: 61.42 },
  { keyPull: 0.75, below: 61.37, above: 61.38 },
  { keyPull: 1, below: 61.33, above: 61.34 },
])(
  "v5 advances the key correction boundary evenly at $keyPull pull",
  ({ keyPull, below, above }) => {
    const knobs = { ...PRESETS["as-played"].knobs, keyPull };
    const pitches = [below, above, 122 - below, 122 - above];
    const result = pitches.map(
      (pitch) => notesFromSegments([segment(pitch)], knobs, context, 5)[0]!.midi,
    );
    expect(result).toEqual([61, 62, 61, 60]);
  },
);

it.each([
  { keyPull: 0.25, pitch: 60.505 },
  { keyPull: 0.5, pitch: 60.515 },
  { keyPull: 0.75, pitch: 60.525 },
])("v5 also rescales chord preference at $keyPull pull", ({ keyPull, pitch }) => {
  const knobs = { ...PRESETS["as-played"].knobs, keyPull };
  const chordContext = {
    ...context,
    key: null,
    harmony: [{ start: 0, end: 2, pitchClasses: new Set([0, 4, 7]) }],
  };
  expect(notesFromSegments([segment(pitch)], knobs, chordContext, 5)[0]!.midi).toBe(60);
});

it.each([1, 2, 3, 4] as const)("retains the historical midpoint decision in v%s", (version) => {
  const knobs = { ...PRESETS["as-played"].knobs, keyPull: 0.5 };
  expect(notesFromSegments([segment(61.45)], knobs, context, version)[0]!.midi).toBe(61);
  expect(notesFromSegments([segment(61.45)], knobs, context, 5)[0]!.midi).toBe(62);
});
