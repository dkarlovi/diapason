import "fake-indexeddb/auto";
import { expect, it } from "vitest";
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
  record.id = "conflict";
  await putRecording(record);
  const writer = createEditorWriter(record.id, { commitId: "stale", revision: 7 });
  writer.enqueue({
    id: "unsaved",
    label: "Instrument",
    createdAt: 2,
    snapshot: captureEditSnapshot({ ...record, play: { instrument: "trumpet", octave: -1 } }),
  });
  await expect(loadShareTune(record.id)).rejects.toThrow(/changed|conflict/i);
  await writer.stop();
});
