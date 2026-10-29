import * as editStorage from "./edit-storage";
import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Editor } from "./components/Editor";
import { AppShell } from "./components/AppShell";
import { allRecordings, getRecording, putRecording } from "./db";
import { recording } from "./test-support/recording";
import { flushEditorSaves, getEditorSaveStatuses, stopEditorSaves } from "./editor-save-queue";
import { listVersions, saveEditCommit, saveVersion } from "./edit-storage";
import { captureEditSnapshot } from "./edit-state";
const played = vi.hoisted(() => ({ sound: null as unknown, position: 0 as number | null }));
vi.mock("./codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("./recorder", async (original) => ({
  ...(await original<typeof import("./recorder")>()),
  analyzeBuffer: () =>
    Array.from({ length: 100 }, (_, i) => ({ t: i * 0.01, freq: 440, clarity: 0.99, rms: 0.1 })),
}));
vi.mock("./trace", async (original) => ({
  ...(await original<typeof import("./trace")>()),
  drawTrace() {},
}));
vi.mock("./playback", () => ({
  playNotes: (_notes: unknown, _duration: number, sound: unknown) => {
    played.sound = sound;
    return { position: () => played.position, stop() {} };
  },
  playPcm: () => ({ position: () => null, stop() {} }),
}));
afterEach(async () => {
  cleanup();
  await flushEditorSaves().catch(() => {});
  for (const status of getEditorSaveStatuses()) await stopEditorSaves(status.recordingId);
  vi.restoreAllMocks();
  played.position = 0;
});
const mount = (id: string) =>
  render(
    <MemoryRouter>
      <AppShell>
        <Editor id={id} />
      </AppShell>
    </MemoryRouter>,
  );
async function ready() {
  return screen.findByRole("img", { name: "MIDI piano roll" });
}
it("retains only current intent and named versions when the editor is reopened", async () => {
  const rec = recording({
    id: "lifecycle",
    name: "Lifecycle",
    melody: { preset: "as-played", key: "auto", overrides: {} },
  });
  await putRecording(rec);
  const user = userEvent.setup();
  const first = mount(rec.id);
  await screen.findByDisplayValue("Lifecycle");
  const roll = await ready();
  await act(async () => {
    fireEvent.keyDown(roll, { key: "Home" });
  });
  await act(async () => {
    fireEvent.keyDown(roll, { key: "ArrowUp" });
  });
  await user.click(screen.getByRole("button", { name: "Recording actions" }));
  await user.click(screen.getByRole("button", { name: "Versions" }));
  await user.type(screen.getByLabelText("Version name"), "First idea");
  await user.click(screen.getByRole("button", { name: "Save version" }));
  await screen.findByText("First idea");
  await user.keyboard("{Escape}");
  await act(async () => {
    fireEvent.keyDown(roll, { key: "Home" });
  });
  await act(async () => {
    fireEvent.keyDown(roll, { key: "ArrowUp" });
    await flushEditorSaves();
  });
  expect((await getRecording(rec.id))?.noteEdits?.pitch[0]?.midi).toBe(71);
  first.unmount();
  await flushEditorSaves();
  mount(rec.id);
  await screen.findByDisplayValue("Lifecycle");
  expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
  await user.click(screen.getByRole("button", { name: "Recording actions" }));
  await user.click(screen.getByRole("button", { name: "Versions" }));
  await user.click(await screen.findByRole("button", { name: "Restore version First idea" }));
  await act(() => flushEditorSaves());
  expect((await getRecording(rec.id))?.noteEdits?.pitch[0]?.midi).toBe(70);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Undo restore version First idea" }));
  await act(() => flushEditorSaves());
  expect((await getRecording(rec.id))?.noteEdits?.pitch[0]?.midi).toBe(71);
});
it("duplicates current intent without inheriting working identity or versions", async () => {
  const rec = recording({ id: "copy-head", name: "Copy source" });
  await putRecording(rec);
  const c = {
    id: "original-head",
    label: "Original",
    createdAt: 1,
    snapshot: captureEditSnapshot(rec),
  };
  const head = await saveEditCommit(rec.id, c, null);
  await saveVersion(
    {
      id: "original-version",
      recordingId: rec.id,
      name: "Keep",
      nameKey: "keep",
      createdAt: 1,
      commit: c,
    },
    head,
  );
  mount(rec.id);
  await screen.findByDisplayValue("Copy source");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Recording actions" }));
  await user.click(screen.getByRole("button", { name: "Duplicate" }));
  await waitFor(async () =>
    expect((await allRecordings()).some((r) => r.name === "Copy source (copy)")).toBe(true),
  );
  const copy = (await allRecordings()).find((r) => r.name === "Copy source (copy)")!;
  expect(copy.editHead).toBeUndefined();
  expect(await listVersions(copy.id)).toEqual([]);
});
it("previews a version with its own instrument while leaving applied intent untouched", async () => {
  const rec = recording({
    id: "preview-version",
    name: "Preview version",
    play: { instrument: "flute", octave: -2 },
  });
  await putRecording(rec);
  const c = {
    id: "flute-version",
    label: "Flute",
    createdAt: 1,
    snapshot: captureEditSnapshot(rec),
  };
  const head = await saveEditCommit(rec.id, c, null);
  await saveVersion(
    {
      id: "flute-saved",
      recordingId: rec.id,
      name: "Flute",
      nameKey: "flute",
      createdAt: 1,
      commit: c,
    },
    head,
  );
  await saveEditCommit(
    rec.id,
    {
      ...c,
      id: "pad-now",
      snapshot: captureEditSnapshot({ ...rec, play: { instrument: "pad", octave: 0 } }),
    },
    head,
  );
  mount(rec.id);
  await screen.findByDisplayValue("Preview version");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Recording actions" }));
  await user.click(screen.getByRole("button", { name: "Versions" }));
  await user.click(await screen.findByRole("button", { name: "Preview version Flute" }));
  expect(played.sound).toEqual({ instrument: "flute", octave: -2 });
  expect((await getRecording(rec.id))?.play).toEqual({ instrument: "pad", octave: 0 });
  await user.click(screen.getByRole("button", { name: "Stop preview of Flute" }));
  expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
});

it("commits an unfinished slider exactly once when leaving the editor", async () => {
  const rec = recording({ id: "leave-draft", name: "Leave draft" });
  await putRecording(rec);
  const view = mount(rec.id);
  await screen.findByDisplayValue("Leave draft");
  const slider = screen.getByLabelText("Steadiness");
  await act(async () => {
    fireEvent.pointerDown(slider, { isPrimary: true, pointerId: 1, button: 0 });
    fireEvent.change(slider, { target: { value: "0.7" } });
  });
  expect((await getRecording(rec.id))?.melody).toBeUndefined();
  view.unmount();
  await flushEditorSaves();
  const stored = (await getRecording(rec.id))!;
  expect(stored.melody?.overrides.steadiness).toBe(0.7);
  expect(stored.editHead?.revision).toBe(1);
});

it("keeps a failed save recoverable from the shell after navigation", async () => {
  const rec = recording({ id: "unsaved-navigation", name: "Unsaved navigation" });
  await putRecording(rec);
  const view = mount(rec.id);
  await screen.findByDisplayValue("Unsaved navigation");
  vi.spyOn(editStorage, "saveEditCommit").mockRejectedValueOnce(new Error("Storage full"));
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Steadiness"), { target: { value: "0.6" } });
  });
  await screen.findByRole("button", { name: "Retry save" });
  view.rerender(
    <MemoryRouter>
      <AppShell>
        <p>Library view</p>
      </AppShell>
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(async () =>
    expect((await getRecording(rec.id))?.melody?.overrides.steadiness).toBe(0.6),
  );
  expect(screen.queryByRole("button", { name: "Retry save" })).toBeNull();
});
it("rejects an editor save when another tab has replaced its expected state", async () => {
  const rec = recording({ id: "stale-editor", name: "Stale editor" });
  await putRecording(rec);
  mount(rec.id);
  await screen.findByDisplayValue("Stale editor");
  await saveEditCommit(
    rec.id,
    {
      id: "other-tab",
      label: "Other tab",
      createdAt: 1,
      snapshot: captureEditSnapshot({ ...rec, play: { instrument: "flute", octave: -1 } }),
    },
    null,
  );
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Steadiness"), { target: { value: "0.6" } });
  });
  await screen.findByRole("button", { name: "Reload" });
  expect((await getRecording(rec.id))?.editHead?.commitId).toBe("other-tab");
  expect((await getRecording(rec.id))?.melody).toBeUndefined();
});
it("resumes a blocked editor load after a pending save is recovered", async () => {
  const rec = recording({ id: "recover-reopened", name: "Recovered editor" });
  await putRecording(rec);
  const first = mount(rec.id);
  await screen.findByDisplayValue("Recovered editor");
  vi.spyOn(editStorage, "saveEditCommit")
    .mockRejectedValueOnce(new Error("Storage full"))
    .mockRejectedValueOnce(new Error("Still full"));
  await act(async () => {
    fireEvent.change(screen.getByLabelText("Steadiness"), { target: { value: "0.6" } });
  });
  await screen.findByRole("button", { name: "Retry save" });
  first.unmount();
  mount(rec.id);
  await act(async () => {});
  expect(screen.queryByDisplayValue("Recovered editor")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await screen.findByText(/Still full/);
  expect(screen.queryByDisplayValue("Recovered editor")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(async () =>
    expect((await getRecording(rec.id))?.melody?.overrides.steadiness).toBe(0.6),
  );
  await screen.findByDisplayValue("Recovered editor");
  expect((screen.getByLabelText("Steadiness") as HTMLInputElement).value).toBe("0.6");
  expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
});
it("duplicates promoted intent without inheriting its persistent history", async () => {
  const rec = recording({ id: "promoted-copy", name: "Promoted source" });
  rec.editHistory = {
    commits: [
      { id: "baseline", label: "Initial state", createdAt: 1, snapshot: captureEditSnapshot(rec) },
    ],
    cursor: 0,
    draft: null,
  };
  rec.editHead = { commitId: "baseline", revision: 1 };
  await putRecording(rec);
  mount(rec.id);
  await screen.findByDisplayValue("Promoted source");
  await userEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
  await waitFor(async () => {
    const copy = (await allRecordings()).find((r) => r.name === "Promoted source (copy)");
    expect(copy).toBeTruthy();
    expect(copy!.editHistory).toBeUndefined();
    expect(copy!.editHead).toBeUndefined();
  });
});
