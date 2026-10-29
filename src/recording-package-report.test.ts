// @vitest-environment node
import { expect, it } from "vitest";
import { recording } from "./test-support/recording";
import {
  captureRecordingPackage,
  encodeRecordingPackage,
  readRecordingPackage,
} from "./recording-package";
import { formatPackageInspection, formatPackageComparison } from "./recording-package-report";
import { processRecording } from "./recording";
it("reports saved notes and inactive edits without changing full-resolution evidence", async () => {
  const frames = Array.from({ length: 12 }, (_, i) => ({
    t: i * 0.05,
    freq: 440,
    clarity: 0.99,
    rms: 0.1,
  }));
  const r = recording();
  const source = processRecording(r, frames).items[0]!.source;
  r.noteEdits = {
    version: 1,
    pitch: [
      { id: "active", ranges: [source], midi: 72 },
      { id: "hidden", ranges: [{ start: 0.99, end: 1 }], midi: 60 },
    ],
  };
  r.play = { instrument: "flute", octave: -1 };
  const snapshot = captureRecordingPackage(
    r,
    new Float32Array(48000),
    frames,
    { browser: "test", audioOutput: "unknown", midiOutput: "Browser synth" },
    1,
  );
  const input = await readRecordingPackage(
    await (await encodeRecordingPackage(snapshot)).arrayBuffer(),
  );
  const before = JSON.stringify(input.metadata);
  const text = formatPackageInspection(input);
  expect(text).toContain("A4 → C5 [corrected]");
  expect(text).toContain("Edit hidden: inactive");
  expect(text).toContain("octave -1");
  expect(
    formatPackageComparison({
      status: "mismatch",
      numericTolerance: 1e-9,
      build: "different",
      difference: "replay.frames",
      saved: input.metadata,
    }),
  ).toContain("Pitches below are logical");
  expect(JSON.stringify(input.metadata)).toBe(before);
});
