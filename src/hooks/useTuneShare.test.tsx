import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { CompressionStream, DecompressionStream } from "node:stream/web";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { putRecording } from "../Recording/Recording.storage";
import { noteRecording } from "../../tests/support/note-recording";
import { tuneFromFragment } from "../tune-url";
import { useTuneShare } from "./useTuneShare";
beforeEach(() => {
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("CompressionStream", CompressionStream);
  vi.stubGlobal("DecompressionStream", DecompressionStream);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("exposes the complete selectable link when clipboard access fails", async () => {
  await putRecording(noteRecording());
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  const showNotice = vi.fn();
  const { result } = renderHook(() => useTuneShare(showNotice));
  await act(() => result.current.copyLink("fixed"));
  const link = result.current.fallbackLink;
  expect(link).toBeTruthy();
  expect((await tuneFromFragment(new URL(link!).hash))?.play).toEqual({
    instrument: "flute",
    octave: -2,
  });
  expect(showNotice.mock.calls.at(-1)?.[0].kind).toBe("info");
  expect(result.current.busy).toBe(false);
});
it("does not expose or copy a link for a missing recording", async () => {
  const clipboard = vi.fn();
  vi.stubGlobal("navigator", { clipboard: { writeText: clipboard } });
  const showNotice = vi.fn();
  const { result } = renderHook(() => useTuneShare(showNotice));
  await act(() => result.current.copyLink("deleted"));
  expect(clipboard).not.toHaveBeenCalled();
  expect(result.current.fallbackLink).toBeNull();
  expect(showNotice.mock.calls.at(-1)?.[0].kind).toBe("error");
});
