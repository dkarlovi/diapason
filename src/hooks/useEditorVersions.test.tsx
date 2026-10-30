import "fake-indexeddb/auto";
import { useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { recording } from "../../tests/support/recording";
import type { Recording } from "../Recording/Recording.type";
import { getRecording, putRecording } from "../Recording/Recording.storage";
import { listVersions } from "../edit-storage";
import { captureEditSnapshot } from "../edit-state";
import { useEditHistory } from "./useEditHistory";
import { useEditorVersions } from "./useEditorVersions";
afterEach(cleanup);
function useHarness(initial: Recording) {
  const [record, replaceRecord] = useState(initial);
  const history = useEditHistory({ record, replaceRecord, beforeChange() {} });
  const versions = useEditorVersions({
    recordingId: record.id,
    history,
    beforeAction() {},
    preview() {},
  });
  return { record, history, ...versions };
}
it("finishes a draft before saving a named version without making an extra commit", async () => {
  const initial = recording({ id: "version-draft" });
  await putRecording(initial);
  const { result } = renderHook(() => useHarness(initial));
  act(() => {
    result.current.history.begin("Octave");
    result.current.history.update(
      captureEditSnapshot({ ...initial, play: { instrument: "flute", octave: -2 } }),
    );
  });
  await act(() => result.current.saveVersion(" First idea "));
  expect(result.current.versions[0]?.name).toBe("First idea");
  expect(result.current.versions[0]?.commit.snapshot.intent.play).toEqual({
    instrument: "flute",
    octave: -2,
  });
  act(() => result.current.history.undo());
  expect(result.current.record.play).toBeUndefined();
  expect(result.current.history.canUndo).toBe(false);
  expect((await listVersions(initial.id))[0]?.commit.snapshot.intent.play?.octave).toBe(-2);
});
it("preserves named states after branching and makes restoration undoable", async () => {
  const initial = recording({ id: "version-branch" });
  await putRecording(initial);
  const { result } = renderHook(() => useHarness(initial));
  act(() =>
    result.current.history.change("Flute", (r) => ({
      ...r,
      play: { instrument: "flute", octave: -1 },
    })),
  );
  await act(() => result.current.saveVersion("Flute idea"));
  const version = result.current.versions[0]!;
  act(() => result.current.history.undo());
  act(() =>
    result.current.history.change("Pad", (r) => ({ ...r, play: { instrument: "pad", octave: 0 } })),
  );
  act(() => result.current.restoreVersion(version.id));
  expect(result.current.record.play?.instrument).toBe("flute");
  act(() => result.current.history.undo());
  expect(result.current.record.play?.instrument).toBe("pad");
  await act(() => result.current.renameVersion(version.id, "Renamed"));
  expect(result.current.versions[0]?.name).toBe("Renamed");
  expect(result.current.versions[0]?.commit.id).toBe(version.commit.id);
  await act(() => result.current.deleteVersion(version.id));
  expect(result.current.versions).toEqual([]);
});
it("retains errors for blank and duplicate names and can save an untouched baseline", async () => {
  const initial = recording({ id: "version-names" });
  await putRecording(initial);
  const { result } = renderHook(() => useHarness(initial));
  await act(() => result.current.saveVersion("Baseline"));
  expect(result.current.history.canUndo).toBe(false);
  await act(async () => {
    await expect(result.current.saveVersion("baseline")).rejects.toThrow();
  });
  expect(result.current.error).toMatch(/already exists/);
  await act(async () => {
    await expect(result.current.saveVersion(" ")).rejects.toThrow();
  });
  expect(result.current.versions).toHaveLength(1);
  expect((await getRecording(initial.id))?.editHead?.commitId).toBe(
    result.current.versions[0]?.commit.id,
  );
  await waitFor(() => expect(result.current.busy).toBe(false));
});
