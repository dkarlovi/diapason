import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { getRecording, putRecording } from "../Recording/Recording.storage";
import { recording } from "../../tests/support/recording";
import { captureEditSnapshot } from "./EditState";
import * as storage from "./Edit.storage";
import { createEditorWriter, getEditorSaveStatuses, retryEditorSaves } from "./EditorSaveQueue";
const commit = (id: string, octave = 0) => ({
  id,
  label: "Octave",
  createdAt: 1,
  snapshot: captureEditSnapshot(recording({ play: { instrument: "beep", octave } })),
});
afterEach(() => vi.restoreAllMocks());
it("serializes commits and undo saves with fresh expected heads", async () => {
  await putRecording(recording({ id: "ordered" }));
  const writer = createEditorWriter("ordered", null);
  writer.enqueue(commit("b", -1));
  writer.enqueue(commit("c", -2));
  writer.enqueue(commit("b", -1));
  await writer.flush();
  expect((await getRecording("ordered"))?.editHead).toEqual({ commitId: "b", revision: 3 });
  expect((await getRecording("ordered"))?.play?.octave).toBe(-1);
  writer.release();
});
it("keeps a failed target retryable after editor release", async () => {
  await putRecording(recording({ id: "retry" }));
  const writer = createEditorWriter("retry", null);
  vi.spyOn(storage, "saveEditCommit").mockRejectedValueOnce(new Error("Quota exceeded"));
  writer.enqueue(commit("b", -1));
  writer.enqueue(commit("c", -2));
  await expect(writer.flush()).rejects.toThrow("Quota");
  writer.release();
  expect(getEditorSaveStatuses().find((s) => s.recordingId === "retry")?.state).toBe("unsaved");
  await retryEditorSaves("retry");
  expect((await getRecording("retry"))?.editHead?.commitId).toBe("c");
  expect(getEditorSaveStatuses().find((s) => s.recordingId === "retry")).toBeUndefined();
});
it("lets the last writer win and reports idle only once its saves land", async () => {
  await putRecording(recording({ id: "last-writer" }));
  const first = createEditorWriter("last-writer", null),
    second = createEditorWriter("last-writer", null);
  first.enqueue(commit("a", -1));
  expect(first.isIdle()).toBe(false);
  await first.flush();
  expect(first.isIdle()).toBe(true);
  second.enqueue(commit("b", -2));
  await second.flush();
  const stored = await getRecording("last-writer");
  expect(stored?.editHead).toEqual({ commitId: "b", revision: 2 });
  expect(stored?.play?.octave).toBe(-2);
  first.adopt(stored!.editHead!);
  expect(first.getHead()).toEqual({ commitId: "b", revision: 2 });
  first.release();
  second.release();
});
