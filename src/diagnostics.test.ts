// @vitest-environment node
import { expect, it } from "vitest";
import { buildReportData } from "./diagnostics";
import { makeReportInput } from "./editor-model";
import { recording } from "./test-support/recording";
import { PIPELINE_VERSION } from "./build-info";
import { qualityStats } from "./recorder";
import type { Frame } from "./notes";

const frames: Frame[] = Array.from({ length: 15 }, (_, i) => ({
  t: 0.123456789 + i * 0.05,
  freq: 440.123456789,
  clarity: 0.9987654321,
  rms: 0.0123456789,
}));

it("reports final enabled notes and all saved/effective settings, rather than default resegmentation", () => {
  const rec = recording({
    quantize: { on: true, subdivision: 1 },
    tuning: { minDurationSec: 0.12 },
    muted: [{ t: 0.4, midi: 69 }],
  });
  const report = JSON.parse(
    JSON.stringify(buildReportData(makeReportInput(rec, frames, qualityStats(frames)))),
  );
  expect(report.schemaVersion).toBe(4);
  expect(report.notes).toEqual([]);
  expect(report.settings).toMatchObject({
    melody: { overrides: { minNoteMs: 120, grid: 1, gridPull: 1 } },
    bpm: 95,
    beatsPerBar: 4,
  });
  expect(report.stages.decoded).toHaveLength(1);
  expect(report.stages.items[0].muted).toBe(true);
  expect(report.saved.muted).toEqual([{ t: 0.4, midi: 69 }]);
  expect(report.frames[0]).toMatchObject({
    t: 0.123456789,
    freq: 440.123456789,
    clarity: 0.9987654321,
    rms: 0.0123456789,
  });
  expect(report.analysis).toMatchObject({
    windowSize: 2048,
    hop: 512,
    minFreq: 250,
    maxFreq: 3000,
    masking: "none",
  });
  expect(report.build.pipeline).toBe(PIPELINE_VERSION);
});

it("records the legacy grid fallback separately from explicitly disabled quantization", () => {
  const report = (overrides = {}) =>
    JSON.parse(
      JSON.stringify(buildReportData(makeReportInput(recording(overrides), [], qualityStats([])))),
    );
  expect(report().settings.origins.melody).toBe("legacy-default");
  expect(report().settings.melody.overrides).not.toHaveProperty("grid");
  expect(report({ quantize: { on: false, subdivision: 2 } }).settings.origins.melody).toBe(
    "legacy-default",
  );
  expect(report({ quantize: { on: false, subdivision: 2 } }).notes).toEqual([]);
});

it("records preset, overrides, effective knobs, key choice and harmony", () => {
  const melody = { preset: "clean" as const, overrides: { steadiness: 0.2 }, key: "auto" as const };
  const report = buildReportData(
    makeReportInput(recording({ melody }), frames, qualityStats(frames)),
  );
  expect(report.settings.melody).toEqual(melody);
  expect(report.stages.knobs.steadiness).toBe(0.2);
  expect(report.stages.key.auto).toBe(true);
  expect(report.stages.key.ranked).toHaveLength(24);
  for (const stage of [
    report.stages.faithful,
    report.stages.decoded,
    report.stages.harmony,
    report.stages.notes,
  ])
    expect(stage).toBeInstanceOf(Array);
});

it("includes pitch intent, source provenance and inactive coverage in evidence", () => {
  const rec = recording({
    durationSec: 2,
    noteEdits: { version: 1, pitch: [{ id: "hidden", midi: 73, ranges: [{ start: 1, end: 2 }] }] },
  });
  const report = buildReportData(makeReportInput(rec, [], qualityStats([])));
  expect(report.stages.editCoverage).toEqual([
    { id: "hidden", status: "inactive", missing: [{ start: 1, end: 2 }] },
  ]);
});
