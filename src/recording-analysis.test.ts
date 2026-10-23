// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { analyzeBuffer } from "./recorder";
import { segmentNotes } from "./notes";
import { pcm16ToFloat } from "./pcm";
import reference from "./fixtures/whistle-regression/reference.json";

const bytes = readFileSync(new URL("./fixtures/whistle-regression/original.wav", import.meta.url));
const pcm = pcm16ToFloat(
  new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.byteLength)),
);

it.each([60, 95, 180])(
  "preserves the headphone melody even when a %i BPM metronome was scheduled",
  (bpm) => {
    const legacy = { maskBpm: bpm, windowSize: 2048 };
    const notes = segmentNotes(analyzeBuffer(pcm, 48000, { ...legacy }));
    expect(notes.map((note) => note.midi)).toEqual(reference.map((note) => note.midi));
    for (const [index, note] of notes.entries()) {
      expect(note.start).toBeCloseTo(reference[index]!.start, 3);
      expect(note.duration).toBeCloseTo(reference[index]!.duration, 3);
    }
  },
);

it.each([44100, 48000])(
  "ignores short audible clicks without splitting a held whistle at %i Hz",
  (rate) => {
    for (const frequency of [0, 1000, 1500, 1600]) {
      const samples = Float32Array.from({ length: rate * 2 }, (_, i) => {
        const t = i / rate,
          beat = Math.floor(t / (60 / 95)),
          dt = t - beat * (60 / 95);
        const amplitude = beat % 4 === 0 ? 0.5 : 0.3;
        const envelope =
          dt < 0.002
            ? 0.0001 * (amplitude / 0.0001) ** (dt / 0.002)
            : amplitude * (0.0001 / amplitude) ** ((dt - 0.002) / 0.038);
        return (
          (frequency ? 0.1 * Math.sin(2 * Math.PI * frequency * t) : 0) +
          (dt < 0.04 ? envelope * Math.sin(2 * Math.PI * (beat % 4 === 0 ? 1600 : 1000) * dt) : 0)
        );
      });
      const notes = segmentNotes(analyzeBuffer(samples, rate));
      expect(notes).toHaveLength(frequency ? 1 : 0);
      if (frequency) expect(notes[0]!.duration).toBeGreaterThan(1.8);
    }
  },
);
