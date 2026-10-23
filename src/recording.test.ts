import { describe, expect, it } from "vitest";
import { recordingItems, recordingNotes } from "./recording";
import type { Recording } from "./db";
import type { Frame } from "./notes";

const frames: Frame[] = Array.from({ length: 12 }, (_, i) => ({
  t: i * 0.05,
  freq: 440,
  clarity: 0.99,
  rms: 0.1,
}));
const recording: Recording = {
  id: "one",
  name: "Test",
  createdAt: 0,
  sampleRate: 48000,
  durationSec: 0.6,
  bpm: 120,
  beatsPerBar: 4,
  audio: new Blob(),
  capture: { gain: 1, peak: 0.1, noiseFloor: 0.003, dspOff: true },
  tuning: {},
  quantize: { on: false, subdivision: 2 },
};

describe("recording notes", () => {
  it("keeps a muted note visible in the editor but removes it from playback and export", () => {
    const muted = { ...recording, muted: [{ t: 0.25, midi: 69 }] };
    expect(recordingItems(muted, frames)).toMatchObject([
      { muted: true, note: { midi: 69, name: "A4" } },
    ]);
    expect(recordingNotes(muted, frames)).toEqual([]);
  });

  it("quantizes the notes used by playback and export", () => {
    const quantized = { ...recording, quantize: { on: true, subdivision: 2 } };
    expect(recordingNotes(quantized, frames)).toMatchObject([
      { midi: 69, start: 0, duration: 0.5 },
    ]);
  });
});

it("a mute follows its note through a merge and returns when switching back", () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({
    t: i * 0.01,
    freq: 440 * 2 ** (((i >= 40 && i < 52 ? 70 : 69) - 69) / 12),
    clarity: 0.99,
    rms: 0.1,
  }));
  const original: Recording = {
    ...recording,
    melody: { preset: "as-played", key: "auto", overrides: { stickiness: 0, slipMs: 0 } },
    muted: [{ t: 0.46, midi: 70 }],
  };
  const baseline = recordingItems(original, frames);
  expect(baseline.map((item) => item.muted)).toEqual([false, true, false]);
  expect(
    recordingItems(
      { ...original, melody: { preset: "gentle", key: "auto", overrides: {} } },
      frames,
    ).map((item) => item.muted),
  ).toEqual([true]);
  expect(recordingItems(original, frames).map((item) => item.muted)).toEqual([false, true, false]);
});
it("previewNotes does not change the record", async () => {
  const { previewNotes } = await import("./recording");
  const rec = {
    ...recording,
    melody: { preset: "as-played" as const, key: "auto" as const, overrides: {} },
  };
  const before = JSON.stringify(rec);
  expect(previewNotes(rec, frames, { preset: "clean" })).toHaveLength(1);
  expect(JSON.stringify(rec)).toBe(before);
});
