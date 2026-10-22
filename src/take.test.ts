import { describe, expect, it } from "vitest";
import { takeItems, takeNotes } from "./take";
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

describe("take notes", () => {
  it("keeps a muted note visible in the editor but removes it from playback and export", () => {
    const muted = { ...recording, muted: [{ t: 0.25, midi: 69 }] };
    expect(takeItems(muted, frames)).toMatchObject([
      { muted: true, note: { midi: 69, name: "A4" } },
    ]);
    expect(takeNotes(muted, frames)).toEqual([]);
  });

  it("quantizes the notes used by playback and export", () => {
    const quantized = { ...recording, quantize: { on: true, subdivision: 2 } };
    expect(takeNotes(quantized, frames)).toMatchObject([{ midi: 69, start: 0, duration: 0.5 }]);
  });
});
