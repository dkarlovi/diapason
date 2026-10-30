import "fake-indexeddb/auto";
import { flushEditorSaves } from "../editor-save-queue";
import { resetEditorStorageDouble } from "../../tests/support/editor-storage-double";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { useEditor } from "./useEditor";
import { recording } from "../../tests/support/recording";
import type { Recording } from "../Recording/Recording.type";

let saved: Recording | undefined;
const rec = recording({
  durationSec: 1,
  melody: { preset: "as-played", key: "auto", overrides: {} },
});
vi.mock("../edit-storage", async (original) => ({
  ...(await original<typeof import("../edit-storage")>()),
  ...(await import("../../tests/support/editor-storage-double")).editorStorageDouble,
}));
vi.mock("../Recording/Recording.storage", () => ({
  getRecording: async () => rec,
  putRecording: async (r: Recording) => {
    saved = r;
  },
  deleteRecording: async () => {},
}));
vi.mock("../codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("../recorder", async (original) => ({
  ...(await original<typeof import("../recorder")>()),
  analyzeBuffer: () =>
    Array.from({ length: 100 }, (_, i) => ({ t: i * 0.01, freq: 440, clarity: 0.99, rms: 0.1 })),
}));
vi.mock("../playback", () => ({
  playNotes: () => ({ position: () => 0, stop() {} }),
  playPcm: () => ({ position: () => 0, stop() {} }),
}));
vi.mock("../trace", async (original) => ({
  ...(await original<typeof import("../trace")>()),
  drawTrace() {},
}));
afterEach(async () => {
  cleanup();
  await flushEditorSaves();
  resetEditorStorageDouble();
  saved = undefined;
});
it("guards direct mutation/reset during auditions and restores the applied selection anchor", async () => {
  const { result } = renderHook(() => useEditor(rec.id), { wrapper: MemoryRouter });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  await act(async () => result.current.selectNote(result.current.items[0]!));
  await act(async () => {
    result.current.shiftSelectedPitch(1);
    result.current.shiftSelectedPitch(1);
    result.current.shiftSelectedPitch(-1);
  });
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(70);
  const snapshot = JSON.stringify(saved);
  await act(async () => result.current.previewMelody({ preset: "clean" }, "preset-clean"));
  expect(result.current.canEditPitch).toBe(false);
  await act(async () => {
    result.current.shiftSelectedPitch(1);
    result.current.resetSelectedPitch();
    result.current.resetAllNoteEdits();
  });
  expect(JSON.stringify(saved)).toBe(snapshot);
  await act(async () => result.current.stopPlayback());
  expect(result.current.selectedNote?.midi).toBe(70);
  await act(async () => result.current.resetSelectedPitch());
  expect(result.current.selectedNote?.midi).toBe(69);
});
it("keeps independently cloned edits when duplicating and survives reload", async () => {
  const { result, unmount } = renderHook(() => useEditor(rec.id), { wrapper: MemoryRouter });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  await act(async () => result.current.selectNote(result.current.items[0]!));
  await act(async () => result.current.shiftSelectedPitch(1));
  const original = saved!;
  await act(async () => result.current.duplicate());
  expect(saved!.id).not.toBe(original.id);
  expect(saved!.noteEdits).toEqual(original.noteEdits);
  expect(saved!.noteEdits).not.toBe(original.noteEdits);
  saved!.noteEdits!.pitch[0]!.ranges[0]!.end = 0.5;
  expect(original.noteEdits!.pitch[0]!.ranges[0]!.end).toBe(1);
  unmount();
});
it.each([0, 127])("makes MIDI endpoint %s moves no-ops", async (midi) => {
  rec.noteEdits = { version: 1, pitch: [{ id: "endpoint", midi, ranges: [{ start: 0, end: 1 }] }] };
  const { result } = renderHook(() => useEditor(rec.id), { wrapper: MemoryRouter });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  await act(async () => result.current.selectNote(result.current.items[0]!));
  await act(async () => result.current.shiftSelectedPitch(midi === 0 ? -1 : 1));
  expect(saved).toBeUndefined();
  expect(result.current.selectedNote?.midi).toBe(midi);
  delete rec.noteEdits;
});
it("does not pin a new override when a slider returns to its starting value", async () => {
  const { resolveKnobs } = await import("../melody/knobs");
  const { result } = renderHook(() => useEditor(rec.id), { wrapper: MemoryRouter });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  const initial = resolveKnobs(
    result.current.melody.preset,
    result.current.melody.overrides,
  ).steadiness;
  await act(async () => {
    result.current.beginKnob("steadiness");
    result.current.draftKnob("steadiness", 0.7);
    result.current.draftKnob("steadiness", initial);
    result.current.commitGesture();
  });
  expect(result.current.canUndo).toBe(false);
  expect(result.current.record?.melody?.overrides.steadiness).toBeUndefined();
});
it("does not commit mute edits against an unapplied audition", async () => {
  const { result } = renderHook(() => useEditor(rec.id), { wrapper: MemoryRouter });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  await act(async () => result.current.selectNote(result.current.items[0]!));
  await act(async () => result.current.previewMelody({ preset: "clean" }, "preset-clean"));
  await act(async () => result.current.muteSelected());
  expect(result.current.record?.muted).toBeUndefined();
  expect(result.current.canUndo).toBe(false);
});
