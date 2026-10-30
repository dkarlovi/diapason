// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../../tests/support/investigation";
import { verifyImportModes } from "./Imports";
it("checks restore and intentional fresh defaults without accessing a browser database", async () => {
  const { context } = await investigationContext();
  const result = await verifyImportModes(context.input);
  expect(result.restore.firstDifference).toBeNull();
  expect(result.fresh.firstDifference).toBeNull();
  expect(result.freshRecord.noteEdits).toBeUndefined();
  expect(result.freshRecord.muted).toBeUndefined();
  expect(result.freshRecord.play).toBeUndefined();
  expect(result.freshRecord.imported?.metadata).toEqual(context.input.metadata);
});
it("retains hidden edits and mutes in restore while fresh preserves only received reference", async () => {
  const { context } = await investigationContext();
  const {
    restoreRecordingPackage,
    captureRecordingPackage,
    encodeRecordingPackage,
    readRecordingPackage,
  } = await import("../Recording/RecordingPackage");
  const p = context.input.metadata;
  if (p.schemaVersion !== 2) throw new Error("fixture");
  const record = await restoreRecordingPackage(context.input, "test.wav", "restore");
  const first = p.evidence.stages.items[0]!;
  record.noteEdits = {
    version: 1,
    pitch: [
      { id: "active", ranges: [first.source], midi: 72 },
      { id: "hidden", ranges: [{ start: 0.49, end: 0.5 }], midi: 60 },
    ],
  };
  record.muted = [{ t: (first.source.start + first.source.end) / 2, midi: first.raw.midi }];
  const encoded = await encodeRecordingPackage(
    captureRecordingPackage(record, context.input.pcm, p.frames, p.exported.context, 2),
  );
  const input = await readRecordingPackage(await encoded.arrayBuffer());
  const result = await verifyImportModes(input);
  expect(result.restore.firstDifference).toBeNull();
  expect(result.restoreRecord.noteEdits?.pitch.map((e) => e.id)).toEqual(["active", "hidden"]);
  expect(result.restoreRecord.muted).toEqual(record.muted);
  expect(result.freshRecord.noteEdits).toBeUndefined();
});
