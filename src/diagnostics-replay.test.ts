// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { diagnosticSnapshot } from "./diagnostic-snapshot";
import { replayDiagnostics } from "./diagnostics-replay";
import { analyzeRecording } from "./recording-analysis";
import { qualityStats } from "./recorder";
import { makeReportInput } from "./editor-model";
import { recording } from "./test-support/recording";
import { pcm16ToFloat, floatToPcm16 } from "./pcm";

async function sample() {
  const pcm = pcm16ToFloat(
    floatToPcm16(
      Float32Array.from({ length: 8000 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 700 * i) / 8000)),
    ),
  );
  const rec = recording({ sampleRate: 8000, quantize: { on: false, subdivision: 2 } });
  const frames = analyzeRecording(pcm, rec.sampleRate, rec);
  return diagnosticSnapshot(makeReportInput(rec, frames, qualityStats(frames, pcm)), pcm);
}

it("replays a serialized JSON/WAV pair through the real processing pipeline", async () => {
  const { report, wav } = await sample();
  const replay = await replayDiagnostics(
    JSON.parse(JSON.stringify(report)),
    await wav.arrayBuffer(),
  );
  expect(replay.status).toBe("match");
  expect(replay.notes).toEqual(report.notes);
  expect(replay.midi).toBeInstanceOf(Blob);
});

it("rejects mismatched audio before trusting note evidence", async () => {
  const { report, wav } = await sample();
  const bytes = await wav.arrayBuffer();
  const altered = new Uint8Array(bytes);
  altered[60] = altered[60]! ^ 1;
  await expect(replayDiagnostics(report, bytes)).rejects.toThrow(/WAV.*match/i);
});

it("names the first changed processing stage and distinguishes a different build", async () => {
  const { report, wav } = await sample();
  report.notes[0]!.midi++;
  report.build.revision = "another-revision";
  const replay = await replayDiagnostics(report, await wav.arrayBuffer());
  expect(replay.status).toBe("mismatch");
  expect(replay.difference).toContain("notes[0].midi");
  expect(replay.build).toBe("different");
});

it("reports legacy evidence as incomplete and rejects malformed current schemas", async () => {
  const old = JSON.parse(
    readFileSync(new URL("./fixtures/whistle-regression/original.json", import.meta.url), "utf8"),
  );
  expect((await replayDiagnostics(old, new ArrayBuffer(0))).status).toBe("incomplete");
  await expect(replayDiagnostics({ schemaVersion: 5 }, new ArrayBuffer(0))).rejects.toThrow(
    /schema/i,
  );
  await expect(replayDiagnostics({ schemaVersion: 4 }, new ArrayBuffer(0))).rejects.toThrow(
    /invalid/i,
  );
});

it("captures settings before hashing so later edits cannot change an export", async () => {
  const rec = recording({ tuning: { rmsGate: 0.004 } });
  const pending = diagnosticSnapshot(
    makeReportInput(rec, [], qualityStats([])),
    new Float32Array(0),
  );
  rec.tuning!.rmsGate = 0.09;
  const { report } = await pending;
  expect(report.saved.tuning!.rmsGate).toBe(0.004);
  expect(report.settings.melody.overrides.levelGate).toBe(0.004);
});
it("reports schema-2 evidence as produced by an older pipeline", async () => {
  const result = await replayDiagnostics({ app: "diapason", schemaVersion: 2 }, new ArrayBuffer(0));
  expect(result.status).toBe("incomplete");
  expect(result.difference).toMatch(/pipeline/i);
});
it("rejects malformed saved melody choices before replaying", async () => {
  const { report, wav } = await sample();
  const invalid = JSON.parse(JSON.stringify(report));
  invalid.saved.melody = { preset: "clean", overrides: { keyPull: 2 }, key: "auto" };
  await expect(replayDiagnostics(invalid, await wav.arrayBuffer())).rejects.toThrow(/settings/i);
});

it("reports schema-3 exports as incomplete older-pipeline evidence", async () => {
  const { report, wav } = await sample();
  const older = JSON.parse(JSON.stringify(report));
  older.schemaVersion = 3;
  const replay = await replayDiagnostics(older, await wav.arrayBuffer());
  expect(replay.status).toBe("incomplete");
});

it("replays frozen edited evidence with identical MIDI and rejects malformed intent", async () => {
  const base = await sample();
  const rec = { ...base.report.saved, audio: new Blob() };
  const first = base.report.stages.items[0]!;
  rec.noteEdits = {
    version: 1,
    pitch: [{ id: "manual", midi: 73, ranges: [{ ...first.source }] }],
  };
  const { decodeWav } = await import("./wav-reader");
  const { notesToMidi } = await import("./midi");
  const { pcm } = decodeWav(await base.wav.arrayBuffer());
  const frames = analyzeRecording(pcm, rec.sampleRate, rec);
  const pending = diagnosticSnapshot(makeReportInput(rec, frames, qualityStats(frames, pcm)), pcm);
  rec.noteEdits.pitch = [];
  const { report, wav } = await pending;
  expect(report.saved.noteEdits?.pitch).toHaveLength(1);
  expect(report.stages.items[0]!.note.midi).toBe(73);
  expect(report.stages.items[0]!.automatic.midi).not.toBe(73);
  const replay = await replayDiagnostics(
    JSON.parse(JSON.stringify(report)),
    await wav.arrayBuffer(),
  );
  expect(replay.status).toBe("match");
  const expected = notesToMidi(report.notes, { bpm: rec.bpm });
  expect(await replay.midi!.arrayBuffer()).toEqual(await expected.arrayBuffer());
  report.saved.noteEdits!.pitch[0]!.midi = 128;
  await expect(replayDiagnostics(report, await wav.arrayBuffer())).rejects.toThrow(/note edits/i);
});
