import "fake-indexeddb/auto";
import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { putRecording } from "../db";
import { recording } from "../test-support/recording";
import { captureEditSnapshot } from "../edit-state";
import { createEditorWriter } from "../editor-save-queue";
import { useEditorSaveStatus } from "./useEditorSaveStatus";
afterEach(cleanup);
it("publishes completed saves and releases closed session status", async () => {
  const rec = recording({ id: "status" });
  await putRecording(rec);
  const { result } = renderHook(useEditorSaveStatus);
  let writer: ReturnType<typeof createEditorWriter>;
  await act(async () => {
    writer = createEditorWriter(rec.id, null);
    writer.enqueue({
      id: "saved",
      createdAt: 1,
      label: "Edit",
      snapshot: captureEditSnapshot(rec),
    });
    await writer.flush();
  });
  expect(result.current.find((s) => s.recordingId === rec.id)?.state).toBe("saved");
  act(() => writer.release());
  expect(result.current.find((s) => s.recordingId === rec.id)).toBeUndefined();
});
