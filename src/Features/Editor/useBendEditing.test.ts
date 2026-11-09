import { cleanup, renderHook, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { noteRecording } from "../../../tests/support/note-recording";
import { processRecording } from "../../Recording/Processing";
import { useBendEditing } from "./useBendEditing";
import type { Recording } from "../../Recording/Recording.type";
afterEach(cleanup);
it("keeps pitch and source evidence while editing and resetting a bend", () => {
  const record = noteRecording();
  record.melody = { preset: "as-played", overrides: { glide: 1 }, key: "auto" };
  const recordRef: { current: Recording } = { current: record };
  const change = vi.fn((_label, transform: (record: Recording) => Recording) => {
    recordRef.current = transform(recordRef.current);
  });
  const hook = renderHook(() =>
    useBendEditing({
      record: recordRef.current,
      recordRef,
      selected: processRecording(recordRef.current, []).items[0],
      frames: [],
      view: { tMin: 0, tMax: 1, midiMin: 60, midiMax: 90 },
      rollRef: { current: null },
      enabled: true,
      active: false,
      glide: 1,
      begin: vi.fn(),
      update: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
      change,
    }),
  );
  act(() => hook.result.current.changePoint(0.2, -7));
  expect(recordRef.current.noteEdits?.bend?.[0]?.points[0]).toEqual({ position: 0, offset: -7 });
  expect(recordRef.current.noteSource).toEqual(record.noteSource);
  hook.rerender();
  expect(hook.result.current.edited).toBe(true);
  act(() => hook.result.current.reset());
  expect(recordRef.current.noteEdits?.bend).toBeUndefined();
  expect(change.mock.calls.map((call) => call[0])).toEqual(["Edit bend", "Reset bend"]);
});
it("preserves closely spaced imported point timing when only its offset changes", () => {
  const record = noteRecording();
  record.melody = { preset: "as-played", key: "auto", overrides: { glide: 1 } };
  record.noteSource.interpretationVersion = 3;
  record.noteSource.segments[0]!.curve = [
    { position: 0, offset: -3 },
    { position: 0.001, offset: -2 },
    { position: 0.015, offset: -1 },
    { position: 1, offset: 0 },
  ];
  const recordRef: { current: Recording } = { current: record };
  const hook = renderHook(() =>
    useBendEditing({
      record,
      recordRef,
      selected: processRecording(record, []).items[0],
      frames: [],
      view: { tMin: 0, tMax: 2, midiMin: 60, midiMax: 90 },
      rollRef: { current: null },
      enabled: true,
      active: false,
      glide: 1,
      begin: vi.fn(),
      update: vi.fn(),
      commit: vi.fn(),
      cancel: vi.fn(),
      change(_label, transform) {
        recordRef.current = transform(recordRef.current);
      },
    }),
  );
  act(() => hook.result.current.setActive(1));
  act(() => hook.result.current.changePoint(0.001, -1.5));
  expect(recordRef.current.noteEdits?.bend?.[0]?.points[1]).toEqual({
    position: 0.001,
    offset: -1.5,
  });
});
