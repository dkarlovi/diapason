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
  await expect(replayDiagnostics({ schemaVersion: 4 }, new ArrayBuffer(0))).rejects.toThrow(
    /schema/i,
  );
  await expect(replayDiagnostics({ schemaVersion: 3 }, new ArrayBuffer(0))).rejects.toThrow(
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

it("replays schema-3 exports made before note IDs were included", async () => {
  const { report, wav } = await sample();
  const older = JSON.parse(JSON.stringify(report));
  for (const item of older.stages.items) delete item.id;
  const replay = await replayDiagnostics(older, await wav.arrayBuffer());
  expect(replay.status).toBe("match");
});
