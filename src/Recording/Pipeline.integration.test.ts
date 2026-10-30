// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { analyzeRecording } from "../Analysis/RecordingAnalysis";
import { processRecording } from "./Processing";
import { notesToMidi } from "../Midi/Midi";
import { decodeWav } from "../Encoding/WavReader";
import { diagnosticSnapshot } from "../Diagnostics/DiagnosticSnapshot";
import { makeReportInput } from "../Editing/Editor.model";
import { qualityStats } from "../Audio/Recorder";
import { replayDiagnostics } from "../Diagnostics/DiagnosticsReplay";
import { readMidiEvents } from "../../tests/support/midi-files";
import { recording } from "../../tests/support/recording";

const file = readFileSync(
  new URL("../../tests/fixtures/whistle-regression/original.wav", import.meta.url),
);
const wav = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const { pcm, sampleRate } = decodeWav(wav);
const rec = recording({
  sampleRate,
  durationSec: pcm.length / sampleRate,
  melody: { preset: "as-played", overrides: {}, key: "auto" },
});
const frames = analyzeRecording(pcm, sampleRate, rec);

it.each([40, 95, 180, 220])(
  "exports faithful pitches without overlapping MIDI notes at %i BPM",
  async (bpm) => {
    for (const subdivision of [0, 1, 2, 3, 4]) {
      const current = {
        ...rec,
        bpm,
        melody: {
          preset: "as-played" as const,
          key: "auto" as const,
          overrides: { grid: subdivision as 0 | 1 | 2 | 3 | 4 },
        },
      };
      const result = processRecording(current, frames);
      expect(result.notes.map((n) => n.midi)).toEqual(
        result.interpretation.decoded.map((n) => n.midi),
      );
      const midi = notesToMidi(result.notes, { bpm });
      const events = readMidiEvents(new Uint8Array(await midi.arrayBuffer()));
      const active = new Set<number>();
      let lastOn = -1;
      for (const event of events) {
        if (event.status === 144) {
          expect(active.size).toBe(0);
          expect(event.tick).toBeGreaterThan(lastOn);
          lastOn = event.tick;
          active.add(event.midi);
        } else {
          expect(active.has(event.midi)).toBe(true);
          expect(event.tick).toBeGreaterThan(lastOn);
          active.delete(event.midi);
        }
      }
      expect(events).toHaveLength(result.notes.length * 2);
      expect(active.size).toBe(0);
    }
  },
);

it("replays the real exported JSON/WAV into identical MIDI bytes", async () => {
  // Replay reanalyzes its audio, so a 2 s excerpt keeps the test fast on slow runners.
  const excerpt = pcm.slice(0, sampleRate * 2);
  const short = { ...rec, durationSec: excerpt.length / sampleRate };
  const excerptFrames = analyzeRecording(excerpt, sampleRate, short);
  const { report, wav: output } = await diagnosticSnapshot(
    makeReportInput(short, excerptFrames, qualityStats(excerptFrames, excerpt)),
    excerpt,
  );
  const replay = await replayDiagnostics(
    JSON.parse(JSON.stringify(report)),
    await output.arrayBuffer(),
  );
  expect(replay.status).toBe("match");
  expect(report.notes.length).toBeGreaterThan(0);
  expect(replay.notes).toEqual(report.notes);
  const expected = await notesToMidi(report.notes, { bpm: rec.bpm }).arrayBuffer();
  expect(new Uint8Array(await replay.midi!.arrayBuffer())).toEqual(new Uint8Array(expected));
  // Reanalysis is CPU-heavy under V8 coverage on shared runners.
}, 15_000);
