import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { useEditor } from "./useEditor";
import { recording } from "../test-support/recording";
import type { Recording } from "../db";
let saved: Recording | undefined;
const rec = recording({
  durationSec: 1,
  melody: { preset: "as-played", key: "auto", overrides: {} },
});
vi.mock("../db", () => ({
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
afterEach(() => {
  cleanup();
  saved = undefined;
});
it("guards direct mutation/reset during auditions and restores the applied selection anchor", async () => {
  const { result } = renderHook(() => useEditor(rec.id), { wrapper: MemoryRouter });
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.selectNote(result.current.items[0]!));
  act(() => {
    result.current.shiftSelectedPitch(1);
    result.current.shiftSelectedPitch(1);
    result.current.shiftSelectedPitch(-1);
  });
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(70);
  const snapshot = JSON.stringify(saved);
  act(() => result.current.previewMelody({ preset: "clean" }, "preset-clean"));
  expect(result.current.canEditPitch).toBe(false);
  act(() => {
    result.current.shiftSelectedPitch(1);
    result.current.resetSelectedPitch();
    result.current.resetAllNoteEdits();
  });
  expect(JSON.stringify(saved)).toBe(snapshot);
  act(() => result.current.stopPlayback());
  expect(result.current.selectedNote?.midi).toBe(70);
  act(() => result.current.resetSelectedPitch());
  expect(result.current.selectedNote?.midi).toBe(69);
});
