import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { getRecording, putRecording } from "./db";
import { recording } from "../tests/support/recording";
import { captureEditSnapshot } from "./edit-state";
import * as storage from "./edit-storage";
import {
  createEditorWriter,
  flushEditorSaves,
  getEditorSaveStatuses,
  retryEditorSaves,
} from "./editor-save-queue";
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
it("does not retry a stale writer against someone else's revision", async () => {
  await putRecording(recording({ id: "conflict" }));
  const first = createEditorWriter("conflict", null),
    stale = createEditorWriter("conflict", null);
  first.enqueue(commit("a"));
  await first.flush();
  first.release();
  stale.enqueue(commit("b"));
  await expect(stale.flush()).rejects.toMatchObject({ code: "conflict" });
  await expect(stale.retry()).rejects.toMatchObject({ code: "conflict" });
  expect((await getRecording("conflict"))?.editHead?.commitId).toBe("a");
  await stale.stop();
  await flushEditorSaves();
});
