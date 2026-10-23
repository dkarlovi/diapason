// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { analyzeRecording } from "./recording-analysis";
import { processRecording } from "./recording";
import { notesToMidi } from "./midi";
import { decodeWav } from "./wav-reader";
import { diagnosticSnapshot } from "./diagnostic-snapshot";
import { makeReportInput } from "./editor-model";
import { qualityStats } from "./recorder";
import { replayDiagnostics } from "./diagnostics-replay";
import { readMidiEvents } from "./test-support/midi-files";
import { recording } from "./test-support/recording";
import reference from "./fixtures/whistle-regression/reference.json";

const file = readFileSync(new URL("./fixtures/whistle-regression/original.wav", import.meta.url));
const wav = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
const { pcm, sampleRate } = decodeWav(wav);
const rec = recording({
  sampleRate,
  durationSec: pcm.length / sampleRate,
  quantize: { on: false, subdivision: 2 },
});
const frames = analyzeRecording(pcm, sampleRate, rec);

it.each([40, 95, 180, 220])(
  "exports the reference melody without overlapping MIDI notes at %i BPM",
  async (bpm) => {
    for (const subdivision of [0, 1, 2, 3, 4]) {
      const current = {
        ...rec,
        bpm,
        quantize: { on: subdivision !== 0, subdivision: subdivision || 2 },
      };
      const result = processRecording(current, frames);
      expect(result.notes.map((n) => n.midi)).toEqual(reference.map((n) => n.midi));
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
      expect(events).toHaveLength(44);
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
  expect(report.notes.length).toBeGreaterThan(2);
  expect(replay.notes).toEqual(report.notes);
  const expected = await notesToMidi(report.notes, { bpm: rec.bpm }).arrayBuffer();
  expect(new Uint8Array(await replay.midi!.arrayBuffer())).toEqual(new Uint8Array(expected));
});
