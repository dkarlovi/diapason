// @vitest-environment node
import { beforeAll, expect, it } from "vitest";
import { loadFixture } from "../tests/support/fixtures";
import {
  captureRecordingPackage,
  encodeRecordingPackage,
  readRecordingPackage,
} from "./recording-package";
import {
  compareRecordingPackage,
  compareSavedMelody,
  matchSourceItems,
} from "./recording-package-comparison";
import type { ReadRecordingPackage } from "./recording-package-types";
let input: ReadRecordingPackage;
it("replays historical packages with a missing Context correction control as zero without changing saved evidence", async () => {
  const historical = structuredClone(input);
  if (historical.metadata.schemaVersion !== 2) throw new Error("package");
  const withoutContext = (knobs: typeof historical.metadata.evidence.stages.knobs) =>
    Object.fromEntries(
      Object.entries(knobs).filter(([key]) => key !== "contextCorrection"),
    ) as typeof knobs;
  historical.metadata.evidence.stages.knobs = withoutContext(
    historical.metadata.evidence.stages.knobs,
  );
  historical.metadata.tune.effectiveKnobs = withoutContext(historical.metadata.tune.effectiveKnobs);
  const { encodeWav } = await import("./wav");
  const bytes = await encodeWav(historical.pcm, historical.sampleRate, [
    { id: "dpsn", data: new TextEncoder().encode(JSON.stringify(historical.metadata)) },
  ]).arrayBuffer();
  const reloaded = await readRecordingPackage(bytes);
  const before = JSON.stringify(reloaded.metadata);
  const result = await compareRecordingPackage(reloaded);
  expect(result.status, result.difference ?? "").toBe("match");
  expect(JSON.stringify(reloaded.metadata)).toBe(before);
}, 15000);
beforeAll(async () => {
  const f = loadFixture("whistle-intro", 2);
  const { pcm, frames } = f;
  const capture = captureRecordingPackage(
    f.record,
    pcm,
    frames,
    { browser: "test", audioOutput: "unknown", midiOutput: "Browser synth" },
    1,
  );
  input = await readRecordingPackage(await (await encodeRecordingPackage(capture)).arrayBuffer());
}, 15000);
it("replays identical analysis and does not treat build changes as a musical difference", async () => {
  if (input.metadata.schemaVersion !== 2) throw new Error("package");
  input.metadata.exported.context.build.revision = "other";
  const before = JSON.stringify(input.metadata);
  const result = await compareRecordingPackage(input);
  expect(result.status, result.difference ?? "").toBe("match");
  expect(result.edited?.evidence.notes).toEqual(input.metadata.evidence.notes);
  expect(compareSavedMelody(input.metadata.evidence, result.edited!.evidence).matches).toBe(true);
  expect(JSON.stringify(input.metadata)).toBe(before);
}, 15000);
it("reports changed saved pitch frames without replacing the original observations", async () => {
  const changed = structuredClone(input);
  if (changed.metadata.schemaVersion !== 2) throw new Error("package");
  changed.metadata.frames[0]!.rms += 0.1;
  const result = await compareRecordingPackage(changed);
  expect(result.status).toBe("mismatch");
  expect(result.difference).toContain("frames");
}, 15000);
it("matches splits and merges by source overlap without confusing adjacent equal pitches", () => {
  const source = (start: number, end: number) => ({ source: { start, end } });
  expect(
    matchSourceItems(
      [source(0, 2), source(2, 3)],
      [source(0, 1), source(1, 2), source(2, 3), source(4, 5)],
    ),
  ).toEqual([
    { savedIndex: 0, currentIndices: [0, 1], kind: "split" },
    { savedIndex: 1, currentIndices: [2], kind: "matched" },
    { savedIndex: null, currentIndices: [3], kind: "extra" },
  ]);
  expect(matchSourceItems([source(0, 1), source(1, 2)], [source(0, 2)]).map((x) => x.kind)).toEqual(
    ["merge", "merge"],
  );
}, 15000);
it("returns incomplete rather than inventing a saved melody for old WAVs", async () => {
  const legacy = structuredClone(input);
  const p = legacy.metadata;
  legacy.metadata = {
    app: "diapason",
    kind: "recording",
    schemaVersion: 1,
    recording: p.recording,
    provenance: p.provenance,
  };
  expect((await compareRecordingPackage(legacy)).status).toBe("incomplete");
}, 15000);

it("removes manual corrections and protected boundaries from automatic analysis", async () => {
  const { processRecording } = await import("./recording");
  const { restoreRecordingPackage } = await import("./recording-package");
  if (input.metadata.schemaVersion !== 2) throw new Error("package");
  const record = await restoreRecordingPackage(input, "test.wav", "restore");
  const first = input.metadata.evidence.stages.items[0]!;
  const other = input.metadata.evidence.stages.items[1];
  record.noteEdits = {
    version: 1,
    pitch: [
      {
        id: "correction",
        ranges: [{ ...first.source }],
        midi: first.note.midi - 1,
      },
    ],
  };
  record.muted = other
    ? [{ t: (other.source.start + other.source.end) / 2, midi: other.raw.midi }]
    : [];
  const snapshot = captureRecordingPackage(
    record,
    input.pcm,
    input.metadata.frames,
    input.metadata.exported.context,
    2,
  );
  const changed = await readRecordingPackage(
    await (await encodeRecordingPackage(snapshot)).arrayBuffer(),
  );
  const result = await compareRecordingPackage(changed);
  expect(result.status, result.difference ?? "").toBe("match");
  expect(result.automatic?.record.noteEdits).toBeUndefined();
  expect(result.automatic?.record.muted).toBeUndefined();
  expect(result.automatic?.evidence.stages.items).toHaveLength(
    processRecording(
      { ...record, noteEdits: { version: 1, pitch: [] }, muted: [] },
      input.metadata.frames,
    ).items.length,
  );
  expect(result.automaticDifferences?.matches).toBe(false);
  expect(result.automaticDifferences?.differences.map((d) => d.intent)).toContain("corrected");
}, 15000);

it("accepts insignificant browser/Node floating-point differences in quality statistics", async () => {
  const historical = structuredClone(input);
  if (historical.metadata.schemaVersion !== 2) throw new Error("package");
  historical.metadata.evidence.quality.centsStd += 3.552713678800501e-15;
  expect((await compareRecordingPackage(historical)).status).toBe("match");
}, 15000);
it("reports changed rendered MIDI even when logical notes and settings agree", async () => {
  const historical = structuredClone(input);
  if (historical.metadata.schemaVersion !== 2) throw new Error("package");
  // The first event is the program change: change its data byte, not the tune.
  historical.metadata.midiBytes[24] = (historical.metadata.midiBytes[24]! + 1) % 128;
  const result = await compareRecordingPackage(historical);
  expect(result.status).toBe("mismatch");
  expect(result.difference).toContain("midiBytes");
}, 15000);

it("uses the same numeric tolerance for musical differences as for replay evidence", () => {
  if (input.metadata.schemaVersion !== 2) throw new Error("package");
  const saved = input.metadata.evidence;
  const current = structuredClone(saved);
  current.stages.items[0]!.note.duration += 3.552713678800501e-15;
  current.notes[0]!.duration += 3.552713678800501e-15;
  expect(compareSavedMelody(saved, current)).toEqual({ matches: true, differences: [] });
});
