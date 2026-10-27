import "fake-indexeddb/auto";
import { StrictMode, useState, type PropsWithChildren } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useEditHistory } from "./useEditHistory";
import { getRecording, putRecording } from "../db";
import { recording } from "../test-support/recording";
import type { Recording } from "../db";
import { captureEditSnapshot } from "../edit-state";
afterEach(cleanup);
function harness(initial: Recording) {
  const [record, replaceRecord] = useState(initial);
  const history = useEditHistory({ record, replaceRecord, beforeChange: () => {} });
  return { record, ...history };
}
it("walks edits and reset without reverting later metadata", async () => {
  const initial = recording({
    id: "history-hook",
    noteEdits: {
      version: 1,
      pitch: [{ id: "inactive", midi: 70, ranges: [{ start: 0, end: 1 }] }],
    },
  });
  await putRecording(initial);
  const { result } = renderHook(() => harness(initial));
  act(() =>
    result.current.change("Reset all note edits", (r) => ({
      ...r,
      noteEdits: { version: 1, pitch: [] },
    })),
  );
  act(() =>
    result.current.change("Change octave", (r) => ({
      ...r,
      play: { instrument: "beep", octave: -1 },
    })),
  );
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(result.current.record.play).toBeUndefined();
  act(() => result.current.undo());
  expect(result.current.record.noteEdits?.pitch[0]?.id).toBe("inactive");
  await act(() => result.current.flush());
  expect((await getRecording(initial.id))?.noteEdits?.pitch[0]?.midi).toBe(70);
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.redo());
  expect(result.current.record.noteEdits?.pitch).toEqual([]);
});
it("discards drafts first and handles batched edits using current refs", async () => {
  const initial = recording({ id: "batch-hook", play: { instrument: "beep", octave: 0 } });
  await putRecording(initial);
  const { result } = renderHook(() => harness(initial));
  act(() => {
    result.current.change("Octave", (r) => ({
      ...r,
      play: { ...r.play!, octave: r.play!.octave - 1 },
    }));
    result.current.change("Octave", (r) => ({
      ...r,
      play: { ...r.play!, octave: r.play!.octave - 1 },
    }));
  });
  expect(result.current.record.play?.octave).toBe(-2);
  act(() => {
    result.current.begin("Draft");
    result.current.update(
      captureEditSnapshot({ ...result.current.record, play: { instrument: "beep", octave: -3 } }),
    );
  });
  expect(result.current.record.play?.octave).toBe(-3);
  act(() => result.current.undo());
  expect(result.current.record.play?.octave).toBe(-2);
  act(() => result.current.undo());
  expect(result.current.record.play?.octave).toBe(-1);
});
it("does not manufacture a commit under StrictMode", async () => {
  const initial = recording({ id: "strict-hook" });
  await putRecording(initial);
  const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
  const { result } = renderHook(() => harness(initial), { wrapper });
  await waitFor(() => expect(result.current.current).not.toBeNull());
  expect(result.current.canUndo).toBe(false);
  expect((await getRecording(initial.id))?.editHead).toBeUndefined();
});
