import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { CompressionStream, DecompressionStream } from "node:stream/web";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { appRoutes } from "./app-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor } from "./components/Editor";
import { allRecordings, deleteRecording } from "./Recording/Recording.storage";
import { createPortableTune } from "./portable-tune";
import { noteRecording } from "../tests/support/note-recording";
import { tuneUrl } from "./tune-url";
import { playNotes } from "./playback";
import { flushEditorSaves } from "./editor-save-queue";
vi.mock("./playback", () => ({
  playNotes: vi.fn(() => ({ position: () => null, stop() {} })),
  playPcm: vi.fn(),
}));
vi.mock("./trace", async (original) => ({
  ...(await original<typeof import("./trace")>()),
  drawTrace() {},
}));
beforeEach(() => {
  vi.stubGlobal("CompressionStream", CompressionStream);
  vi.stubGlobal("DecompressionStream", DecompressionStream);
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
});
afterEach(async () => {
  cleanup();
  await flushEditorSaves();
  for (const r of await allRecordings()) await deleteRecording(r.id);
  vi.unstubAllGlobals();
});
it("opens a shared melody immediately and plays its sound without importing", async () => {
  const sender = noteRecording();
  sender.noteEdits = {
    version: 1,
    pitch: [{ id: "sender-correction", ranges: [{ start: 0, end: 0.5 }], midi: 75 }],
  };
  sender.muted = [{ t: 0.75, midi: 74 }];
  const url = new URL(await tuneUrl(createPortableTune(sender, []), window.location.origin));
  render(
    <RouterProvider
      router={createMemoryRouter(appRoutes, { initialEntries: [`/tune${url.hash}`] })}
    />,
  );
  await screen.findByDisplayValue("Shared");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Play MIDI" }));
  await waitFor(() =>
    expect(playNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ midi: 75 })]),
      2,
      { instrument: "flute", octave: -2 },
    ),
  );
  expect(await allRecordings()).toEqual([]);
  expect(screen.getByRole("button", { name: "Show original" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("slider", { name: "Steadiness" }).hasAttribute("disabled")).toBe(true);
});
it("starts fresh history and supports resetting, undoing and unmuting imported edits", async () => {
  const { renderHook, act } = await import("@testing-library/react");
  const { MemoryRouter } = await import("react-router");
  const { useEditor } = await import("./hooks/useEditor");
  const { putRecording, getRecording } = await import("./Recording/Recording.storage");
  const record = noteRecording();
  record.noteEdits = {
    version: 1,
    pitch: [{ id: "imported", ranges: [{ start: 0, end: 0.5 }], midi: 75 }],
  };
  record.muted = [{ t: 0.75, midi: 74 }];
  await putRecording(record);
  const { result } = renderHook(() => useEditor(record.id), {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
  await waitFor(() => expect(result.current.analysisReady).toBe(true));
  expect(result.current.canUndo).toBe(false);
  act(() => result.current.selectNote(result.current.items[0]!));
  act(() => result.current.changeKey({ tonic: 1, mode: "major" }));
  const automatic = result.current.items[0]!.automatic.midi;
  expect(result.current.items[0]!.note.midi).toBe(75);
  act(() => result.current.resetSelectedPitch());
  expect(result.current.items[0]!.note.midi).toBe(automatic);
  expect(result.current.items[0]!.editState.axes).toEqual([]);
  act(() => result.current.undo());
  expect(result.current.items[0]!.note.midi).toBe(75);
  act(() => result.current.selectNote(result.current.items[1]!));
  act(() => result.current.muteSelected());
  expect(result.current.items[1]!.muted).toBe(false);
  act(() => result.current.changePlay({ instrument: "trumpet", octave: -1 }));
  expect(result.current.play).toEqual({ instrument: "trumpet", octave: -1 });
  act(() => result.current.undo());
  expect(result.current.play).toEqual({ instrument: "flute", octave: -2 });
  await act(() => flushEditorSaves(record.id));
  const reloaded = (await getRecording(record.id))!;
  expect(reloaded.noteSource).toBeTruthy();
  expect(createPortableTune(reloaded, []).play).toEqual({ instrument: "flute", octave: -2 });
  let copied = "";
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async (text: string) => {
        copied = text;
      },
    },
  });
  act(() => result.current.beginKnob("keyPull"));
  act(() => result.current.draftKnob("keyPull", 0.3));
  expect(result.current.drafting).toBe(true);
  await act(() => result.current.copyTuneLink());
  const { tuneFromFragment } = await import("./tune-url");
  expect((await tuneFromFragment(new URL(copied).hash))?.melody.overrides.keyPull).toBe(0.3);
  expect(result.current.drafting).toBe(false);
});
it("copies a tune link from the editor recording dropdown", async () => {
  const { MemoryRouter } = await import("react-router");
  const { putRecording } = await import("./Recording/Recording.storage");
  const { tuneFromFragment } = await import("./tune-url");
  let copied = "";
  vi.stubGlobal("navigator", {
    userAgent: navigator.userAgent,
    clipboard: {
      writeText: async (text: string) => {
        copied = text;
      },
    },
  });
  await putRecording(noteRecording());
  render(
    <MemoryRouter>
      <Editor id="fixed" />
    </MemoryRouter>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy tune link" }));
  await waitFor(() => expect(copied).toContain("#tune="));
  expect((await tuneFromFragment(new URL(copied).hash))?.play).toEqual({
    instrument: "flute",
    octave: -2,
  });
  expect(screen.queryByRole("button", { name: "Copy tune link" })).toBeNull();
});
