import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
import * as editStorage from "../Editing/Edit.storage";
import { putRecording } from "../Recording/Recording.storage";
import { noteRecording } from "../../tests/support/note-recording";
import { loadShareTune } from "./TuneSharing";
import { createEditorWriter } from "../Editing/EditorSaveQueue";
import { captureEditSnapshot } from "../Editing/EditState";
it("shares the latest committed settings after pending saves drain", async () => {
  const record = noteRecording();
  await putRecording(record);
  const writer = createEditorWriter(record.id, null);
  writer.enqueue({
    id: "latest",
    label: "Instrument",
    createdAt: 2,
    snapshot: captureEditSnapshot({ ...record, play: { instrument: "trumpet", octave: -1 } }),
  });
  const tune = await loadShareTune(record.id);
  expect(tune.play).toEqual({ instrument: "trumpet", octave: -1 });
  writer.release();
});
it("refuses a deleted recording", async () => {
  await expect(loadShareTune("missing")).rejects.toThrow(/found/i);
});
it("refuses to share when the latest edits cannot be saved", async () => {
  const record = noteRecording();
  record.id = "unsaved";
  await putRecording(record);
  vi.spyOn(editStorage, "saveEditCommit").mockRejectedValueOnce(new Error("Storage full"));
  const writer = createEditorWriter(record.id, null);
  writer.enqueue({
    id: "unsaved",
    label: "Instrument",
    createdAt: 2,
    snapshot: captureEditSnapshot({ ...record, play: { instrument: "trumpet", octave: -1 } }),
  });
  await expect(loadShareTune(record.id)).rejects.toThrow(/Storage full/);
  await writer.stop();
});
