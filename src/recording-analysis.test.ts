// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { analyzeBuffer } from "./recorder";
import { analyzeRecording, resolveAnalysisOptions } from "./recording-analysis";
import { recording } from "./test-support/recording";
import { segmentNotes } from "./notes";
import { pcm16ToFloat } from "./pcm";
import reference from "./fixtures/whistle-regression/reference.json";

const bytes = readFileSync(new URL("./fixtures/whistle-regression/original.wav", import.meta.url));
const pcm = pcm16ToFloat(
  new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.byteLength)),
);

// Analyze the 20 s fixture once: the analysis is deterministic for given options.
const notes = segmentNotes(analyzeRecording(pcm, 48000, recording()));

it("preserves the headphone melody from the real recording", () => {
  expect(notes.map((note) => note.midi)).toEqual(reference.map((note) => note.midi));
  for (const [index, note] of notes.entries()) {
    expect(note.start).toBeCloseTo(reference[index]!.start, 3);
    expect(note.duration).toBeCloseTo(reference[index]!.duration, 3);
  }
});

it("resolves identical analysis options whatever metronome tempo was scheduled", () => {
  const options = [60, 95, 180].map((bpm) => resolveAnalysisOptions(recording({ bpm })));
  expect(options[1]).toEqual(options[0]);
  expect(options[2]).toEqual(options[0]);
});

// Frequency 0 is click-only input; 1000 and 1600 Hz match the metronome clicks.
const clickCases = [44100, 48000].flatMap((rate) =>
  [0, 1000, 1500, 1600].map((frequency) => [rate, frequency] as const),
);

it.each(clickCases)(
  "ignores short audible clicks without splitting a held whistle at %i Hz (whistle %i Hz)",
  (rate, frequency) => {
    const samples = Float32Array.from({ length: rate * 1.3 }, (_, i) => {
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
    if (frequency) expect(notes[0]!.duration).toBeGreaterThan(1.1);
  },
);
