import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { CompressionStream, DecompressionStream } from "node:stream/web";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appRoutes } from "../../App/AppRouter";
import { allRecordings, deleteRecording } from "../../Recording/Recording.storage";
import { createPortableTune } from "../../Tune/PortableTune";
import { noteRecording } from "../../../tests/support/note-recording";
import { tuneUrl } from "../../Tune/TuneUrl";
import { flushEditorSaves } from "../../Editing/EditorSaveQueue";
vi.mock("../../Playback/Playback", () => ({
  playNotes: vi.fn(() => ({ position: () => null, stop() {} })),
  playPcm: vi.fn(),
}));
vi.mock("../../Audio/Trace", async (original) => ({
  ...(await original<typeof import("../../Audio/Trace")>()),
  drawTrace() {},
}));
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("CompressionStream", CompressionStream);
  vi.stubGlobal("DecompressionStream", DecompressionStream);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(async () => {
  cleanup();
  await flushEditorSaves();
  for (const r of await allRecordings()) await deleteRecording(r.id);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open(legacy = false, embedded = false, search = "") {
  const url = new URL(
    await tuneUrl(createPortableTune(noteRecording(), []), "https://example.com"),
  );
  const params = new URLSearchParams(search);
  if (embedded) params.set("embed", "1");
  const entry = `${legacy ? "/" : "/tune"}${params.size ? "?" + params : ""}${url.hash}`;
  const router = createMemoryRouter(appRoutes, { initialEntries: [entry] });
  const view = render(<RouterProvider router={router} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
  return { router, view, entry };
}
it.each([false, true])("opens a tune directly without importing (legacy=%s)", async (legacy) => {
  await open(legacy);
  expect(await allRecordings()).toEqual([]);
  expect(screen.queryByRole("heading", { name: "Import recordings" })).toBeNull();
  expect(screen.getByDisplayValue("Shared")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show original" }).hasAttribute("disabled")).toBe(true);
});
it("recovers edits on refresh and discards them on confirmed exit", async () => {
  const first = await open();
  fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
    target: { value: "Changed" },
  });
  first.view.unmount();
  const router = createMemoryRouter(appRoutes, { initialEntries: [first.entry] });
  render(<RouterProvider router={router} />);
  await screen.findByDisplayValue("Changed");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(() => router.navigate("/new"));
  expect(router.state.location.pathname).toBe("/tune");
  confirm.mockReturnValue(true);
  await act(() => router.navigate("/"));
  expect(router.state.location.pathname).toBe("/");
  expect(sessionStorage.length).toBe(0);
});
it("shows a malformed embedded tune error instead of capture", async () => {
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/tune?embed=1#tune=%%%"] });
  render(<RouterProvider router={router} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(router.state.location.pathname).toBe("/tune");
});
it.each([false, true])(
  "saves through the dropdown then edits a recording (embed=%s)",
  async (embedded) => {
    const { router } = await open(false, embedded);
    if (!embedded)
      fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
        target: { value: "Saved melody" },
      });
    fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
    expect(screen.queryByRole("button", { name: "Delete recording" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/recording\//));
    expect(router.state.location.hash).toBe("");
    const records = await allRecordings();
    expect(records).toHaveLength(1);
    expect(records[0]!.editHistory?.commits).toHaveLength(1);
    expect(sessionStorage.length).toBe(0);
    if (embedded) {
      expect(router.state.location.search).toContain("tuneEmbed=1");
      await act(() => router.navigate("/new"));
      expect(router.state.location.pathname).toBe(`/recording/${records[0]!.id}`);
    } else expect(records[0]!.name).toBe("Saved melody");
  },
);
it("warns on unload only when musical work or an unblurred name differs", async () => {
  await open();
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
    target: { value: "Unsaved" },
  });
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
});
it("keeps a saved embed on the same recording after remount", async () => {
  const first = await open(false, true);
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(first.router.state.location.pathname).toMatch(/^\/recording\//));
  const entry = first.router.state.location.pathname + first.router.state.location.search;
  first.view.unmount();
  const router = createMemoryRouter(appRoutes, { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
  await act(() => router.navigate("/recording/different"));
  expect(router.state.location.pathname).toBe(entry.split("?")[0]);
});
it("transfers pitch history and named versions through Save and reopening", async () => {
  const first = await open();
  const roll = screen.getByRole("img", { name: "MIDI piano roll" });
  fireEvent.keyDown(roll, { key: "Home" });
  fireEvent.keyDown(roll, { key: "ArrowUp" });
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Versions" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Version name" }), {
    target: { value: "Idea" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save version" }));
  await screen.findByRole("button", { name: "Restore version Idea" });
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(first.router.state.location.pathname).toMatch(/^\/recording\//));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Undo edit pitch/i }).hasAttribute("disabled")).toBe(
      false,
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /Undo edit pitch/i }));
  await act(() => flushEditorSaves());
  const [saved] = await allRecordings();
  expect(saved!.editHistory?.cursor).toBe(0);
  expect(saved!.editHistory?.commits).toHaveLength(2);
  const entry = first.router.state.location.pathname;
  first.view.unmount();
  render(<RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [entry] })} />);
  expect(await screen.findByRole("button", { name: /Redo edit pitch/i })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Versions" }));
  expect(await screen.findByRole("button", { name: "Restore version Idea" })).toBeTruthy();
});
it("keeps failed Save retryable without importing partially", async () => {
  const promotion = await import("./TunePromotion.storage");
  const save = vi
    .spyOn(promotion, "promoteAdHocTune")
    .mockRejectedValueOnce(new Error("Storage is full"));
  const { router } = await open();
  fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
    target: { value: "Retry me" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText("Storage is full")).toBeTruthy();
  expect(router.state.location.pathname).toBe("/tune");
  expect(await allRecordings()).toHaveLength(0);
  expect(sessionStorage.length).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  const button = screen.getByRole("button", { name: "Save" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/recording\//));
  expect(save).toHaveBeenCalledTimes(2);
  expect(await allRecordings()).toHaveLength(1);
});
it("treats cleanup failure after Save as success and reports it in the recording editor", async () => {
  const { router } = await open();
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("blocked cleanup");
  });
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/recording\//));
  expect(await screen.findByText(/saved.*temporary draft.*clear/i)).toBeTruthy();
  expect(await allRecordings()).toHaveLength(1);
});
it("does not clear a newer session when an old Save completes after navigation", async () => {
  const promotion = await import("./TunePromotion.storage");
  const original = promotion.promoteAdHocTune;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(promotion, "promoteAdHocTune").mockImplementationOnce(async (...args) => {
    await gate;
    return original(...args);
  });
  const { router, entry } = await open();
  fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
    target: { value: "Old work" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await act(() => router.navigate("/"));
  await act(() => router.navigate(entry));
  await screen.findByDisplayValue("Shared");
  fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
    target: { value: "New work" },
  });
  await act(async () => {
    release();
    await gate;
  });
  await waitFor(async () => expect(await allRecordings()).toHaveLength(1));
  expect(router.state.location.pathname).toBe("/tune");
  expect(sessionStorage.length).toBe(1);
  expect(JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!).name).toBe("New work");
});
it("allows memory-only exits and reports a persisted draft removal failure", async () => {
  const first = await open();
  fireEvent.change(screen.getByRole("textbox", { name: "Recording name" }), {
    target: { value: "Durable work" },
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const removal = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  await act(() => first.router.navigate("/"));
  expect(first.router.state.location.pathname).toBe("/tune");
  expect(await screen.findByText(/could not discard/i)).toBeTruthy();
  removal.mockRestore();
  await act(() => first.router.navigate("/"));
  first.view.unmount();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const second = await open();
  await act(() => second.router.navigate("/"));
  expect(second.router.state.location.pathname).toBe("/");
});
it("keeps an active pitch gesture when browser Back is canceled", async () => {
  const { createAdHocDraft } = await import("./AdHocTune");
  const { writeAdHocDraft } = await import("./AdHoc.storage");
  const { captureEditSnapshot } = await import("../../Editing/EditState");
  const record = noteRecording();
  const tune = createPortableTune(record, []);
  const hash = new URL(await tuneUrl(tune, "https://example.com")).hash;
  const draft = createAdHocDraft(tune, hash, "gesture", 1);
  draft.history.draft = {
    label: "Edit pitch",
    snapshot: captureEditSnapshot({
      ...record,
      noteEdits: {
        version: 1,
        pitch: [{ id: "draft-pitch", ranges: [{ start: 0, end: 0.5 }], midi: 73 }],
      },
    }),
  };
  writeAdHocDraft(sessionStorage, draft);
  const router = createMemoryRouter(appRoutes, {
    initialEntries: ["/", `/tune${hash}`],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  await screen.findByDisplayValue("Shared");
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(() => router.navigate(-1));
  expect(router.state.location.pathname).toBe("/tune");
  const persisted = JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!);
  expect(persisted.history.draft).toBeNull();
  expect(persisted.history.commits).toHaveLength(2);
  expect(persisted.history.commits[1].snapshot.intent.noteEdits.pitch[0].midi).toBe(73);
  expect(screen.getByRole("button", { name: /Undo edit pitch/i }).hasAttribute("disabled")).toBe(
    false,
  );
});

it("retains an embedded tune's appearance through legacy redirects, Save, and refresh", async () => {
  const query = new URLSearchParams({
    theme: "AQF7PGI",
    scheme: "dark",
  });
  const { router, view } = await open(true, true, query.toString());
  expect(router.state.location.hash).toMatch(/^#tune=/);
  fireEvent.click(screen.getByRole("button", { name: "Recording actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/recording\//));
  const { pathname, search } = router.state.location;
  expect(new URLSearchParams(search).get("theme")).toBe("AQF7PGI");
  expect(new URLSearchParams(search).get("scheme")).toBe("dark");
  expect(new URLSearchParams(search).get("tuneEmbed")).toBe("1");
  view.unmount();
  const refreshed = createMemoryRouter(appRoutes, { initialEntries: [pathname + search] });
  render(<RouterProvider router={refreshed} />);
  expect(document.documentElement.style.colorScheme).toBe("dark");
  expect(refreshed.state.location.search).toBe(search);
});
