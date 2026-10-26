// @vitest-environment node
import { expect, it } from "vitest";
import { loadFixture } from "../test-support/fixtures";
import { analyzeRecording } from "../recording-analysis";
import { qualityStats } from "../recorder";
import { diagnosticSnapshot } from "../diagnostic-snapshot";
import { makeReportInput } from "../editor-model";
import { replayDiagnostics } from "../diagnostics-replay";
import { notesToMidi } from "../midi";
import { PRESETS, type PresetId } from "./knobs";
const take = loadFixture("whistle-take2");
const pcm = take.pcm.slice(0, take.sampleRate * 2);
const frames = analyzeRecording(pcm, take.sampleRate, take.record);
it.each(Object.keys(PRESETS) as PresetId[])(
  "replays schema-4 %s with identical MIDI bytes",
  async (preset) => {
    const rec = {
      ...take.record,
      durationSec: pcm.length / take.sampleRate,
      melody: { preset, key: "auto" as const, overrides: {} },
    };
    const { report, wav } = await diagnosticSnapshot(
      makeReportInput(rec, frames, qualityStats(frames, pcm)),
      pcm,
    );
    expect(report.schemaVersion).toBe(4);
    const replay = await replayDiagnostics(
      JSON.parse(JSON.stringify(report)),
      await wav.arrayBuffer(),
    );
    expect(replay.status).toBe("match");
    expect(new Uint8Array(await replay.midi!.arrayBuffer())).toEqual(
      new Uint8Array(await notesToMidi(report.notes, { bpm: rec.bpm }).arrayBuffer()),
    );
  },
  // Each preset reanalyzes the PCM; coverage instrumentation can exceed 5 seconds.
  15_000,
);
