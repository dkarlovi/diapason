import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Library } from "./Library";
import type { Recording } from "../Recording/Recording.type";
import { decodeAudio } from "../codec";
import { putRecording } from "../Recording/Recording.storage";
import { recording } from "../../tests/support/recording";
import { encodeWav } from "../wav";
import { encodeTaggedWav } from "../wav-metadata";

vi.mock("../codec", () => ({
  decodeAudio: vi.fn(async () => new Float32Array([0, 0.5, 1])),
  encodeAudio: vi.fn(async () => new Blob()),
}));

let recordings: Recording[] = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

vi.mock("../Recording/Recording.storage", () => ({
  allRecordings: vi.fn(async () => recordings),
  storageEstimate: vi.fn(async () => null),
  getRecording: vi.fn(async (id: string) => recordings.find((recording) => recording.id === id)),
  putRecording: vi.fn(async (recording: Recording) => {
    recordings = [...recordings, recording];
  }),
  deleteRecording: vi.fn(),
  saveWaveform: vi.fn(async () => undefined),
}));

vi.mock("../recording-import-storage", () => ({
  insertImportedRecording: async (record: Recording, disposition: "original" | "copy") => {
    const saved = disposition === "copy" ? { ...record, id: crypto.randomUUID() } : record;
    if (recordings.some((r) => r.id === saved.id))
      throw new Error("This recording already exists. Import as copy to keep both.");
    await putRecording(saved);
    return saved;
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.clearAllMocks();
  recordings = [];
  history.replaceState(null, "", "/diapason/");
});

describe("library", () => {
  it("shows the empty state and opens recording at a path URL", async () => {
    render(
      <BrowserRouter basename="/diapason">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/new" element={<div>Capture route</div>} />
        </Routes>
      </BrowserRouter>,
    );
    expect(await screen.findByText(/No recordings yet/)).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: /New recording/ }));
    await waitFor(() => expect(location.pathname).toBe("/diapason/new"));
    expect(await screen.findByText("Capture route")).toBeTruthy();
    expect(location.hash).toBe("");
  });

  it("duplicates a recording and shows the new card", async () => {
    recordings = [
      {
        id: "first",
        editHead: { commitId: "original", revision: 4 },
        name: "Melody",
        createdAt: 1,
        sampleRate: 48000,
        durationSec: 2,
        bpm: 90,
        beatsPerBar: 4,
        audio: new Blob(),
        waveform: { version: 1, rms: new Float32Array([0, 0.25, 1]) },
        capture: { gain: 1, peak: 0.2, noiseFloor: 0.003, dspOff: true },
        tuning: {},
      },
    ];
    render(
      <BrowserRouter basename="/diapason">
        <Library />
      </BrowserRouter>,
    );
    expect(await screen.findByText("Melody")).toBeTruthy();
    const thumbnail = document.querySelector(".recording-waveform");
    expect(thumbnail?.getAttribute("aria-hidden")).toBe("true");
    expect(thumbnail?.querySelector("mask .recording-waveform-cutout")).not.toBeNull();
    expect(thumbnail?.querySelector(".recording-waveform-cutout")?.getAttribute("x")).toBe("70");
    expect(thumbnail?.parentElement?.className).toBe("library-record");
    expect(decodeAudio).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText("Actions for Melody"));
    await userEvent.click(document.body);
    expect(screen.queryByRole("button", { name: "Duplicate" })).toBeNull();
    await userEvent.click(screen.getByLabelText("Actions for Melody"));
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByText("Melody (copy)")).toBeTruthy();
    expect(recordings[1]!.editHead).toBeUndefined();
    expect(document.querySelectorAll(".recording-waveform")).toHaveLength(2);
    const masks = [...document.querySelectorAll(".recording-waveform mask")].map((mask) => mask.id);
    expect(new Set(masks).size).toBe(2);
    expect([...recordings[1]!.waveform!.rms]).toEqual([0, 0.25, 1]);
    expect(document.activeElement).toBe(screen.getByLabelText("Actions for Melody"));
  });

  it("shows the gradient and existing controls while a waveform is unavailable", async () => {
    recordings = [
      {
        id: "legacy",
        name: "Older melody",
        createdAt: 1,
        sampleRate: 48000,
        durationSec: 2,
        bpm: 90,
        beatsPerBar: 4,
        audio: new Blob(),
        capture: { gain: 1, peak: 0.2, noiseFloor: 0.003, dspOff: true },
      },
    ];
    render(
      <BrowserRouter basename="/diapason">
        <Library />
      </BrowserRouter>,
    );
    expect(await screen.findByText("Older melody")).toBeTruthy();
    const wash = document.querySelector(".recording-waveform");
    expect(wash).not.toBeNull();
    expect(wash?.querySelector("linearGradient")).not.toBeNull();
    expect(wash?.querySelector("mask")).toBeNull();
    expect(wash?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("button", { name: "Play audio: Older melody" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
      "/diapason/recording/legacy",
    );
  });

  it("shows and consumes deletion feedback when returning from the editor", async () => {
    history.replaceState({ usr: { deletedRecording: "Edited melody" } }, "", "/diapason/");
    render(
      <BrowserRouter basename="/diapason">
        <Library />
      </BrowserRouter>,
    );
    expect((await screen.findByRole("status")).textContent).toContain("Deleted “Edited melody”");
    await waitFor(() => expect(history.state.usr).toBeNull());
  });

  it("confirms successful deletion with a toast", async () => {
    recordings = [recording({ id: "delete-me", name: "Old melody" })];
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    render(
      <BrowserRouter basename="/diapason">
        <Library />
      </BrowserRouter>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Actions for Old melody" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect((await screen.findByRole("status")).textContent).toContain("Deleted “Old melody”");
  });

  describe("import", () => {
    const pcm = Float32Array.of(0, 0.5, -0.5, 0.25);
    const context = { browser: "UA", audioOutput: "unknown", midiOutput: "Browser synth" };
    const tagged = (id = "t1", name = "Shared") =>
      new File([encodeTaggedWav(recording({ id, name }), pcm, context)], `${id}.wav`, {
        type: "audio/wav",
      });
    const plain = () => new File([encodeWav(pcm, 48000)], "plain.wav", { type: "audio/wav" });
    const UNTAGGED = "Only WAVs exported from diapason can be imported for now.";
    const renderLibrary = () =>
      render(
        <BrowserRouter basename="/diapason">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/recording/:id" element={<div>Editor route</div>} />
          </Routes>
        </BrowserRouter>,
      );
    const libraryRoot = () => document.getElementById("view-library")!;

    const popover = () => screen.findByRole("dialog", { name: "Import recordings" });
    const importButton = () => screen.getByRole("button", { name: /^Import/ });

    it("shows a popover for a picked file and imports it on confirm", async () => {
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), tagged());
      const dialog = await popover();
      expect(within(dialog).getByText("Shared")).toBeTruthy();
      expect(within(dialog).getByText(/95 BPM · 4\/4 · diapason /)).toBeTruthy();
      expect(vi.mocked(putRecording)).not.toHaveBeenCalled();
      await userEvent.click(importButton());
      expect((await screen.findByRole("status")).textContent).toContain("Imported “Shared”");
      expect(
        within(screen.getByRole("status")).getByRole("link", { name: "Open" }).getAttribute("href"),
      ).toBe("/diapason/recording/t1");
      expect(vi.mocked(putRecording)).toHaveBeenCalledWith(expect.objectContaining({ id: "t1" }));
      expect(await screen.findByRole("heading", { name: "Shared" })).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("records when and from which file a recording was imported", async () => {
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), tagged());
      await popover();
      const before = Date.now();
      await userEvent.click(importButton());
      await screen.findByRole("heading", { name: "Shared" });
      const saved = vi.mocked(putRecording).mock.calls[0]![0];
      expect(saved.imported).toMatchObject({
        fileName: "t1.wav",
        metadata: { app: "diapason", recording: { id: "t1", name: "Shared" } },
      });
      expect(saved.imported!.at).toBeGreaterThanOrEqual(before);
    });

    it("shows the same popover for a dropped file", async () => {
      renderLibrary();
      fireEvent.drop(libraryRoot(), { dataTransfer: { files: [tagged()], types: ["Files"] } });
      expect(within(await popover()).getByText("Shared")).toBeTruthy();
      await userEvent.click(importButton());
      expect(await screen.findByRole("heading", { name: "Shared" })).toBeTruthy();
      expect(vi.mocked(putRecording)).toHaveBeenCalledTimes(1);
    });

    it("saves nothing when cancelled", async () => {
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), tagged());
      await popover();
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(vi.mocked(putRecording)).not.toHaveBeenCalled();
    });

    it("explains untagged WAVs in the popover", async () => {
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), plain());
      const dialog = await popover();
      expect(within(dialog).getByText("plain.wav")).toBeTruthy();
      expect(within(dialog).getByText(UNTAGGED)).toBeTruthy();
      expect(importButton()).toHaveProperty("disabled", true);
    });

    it("offers to open a recording that is already in the library", async () => {
      recordings = [recording({ id: "t1", name: "Shared" })];
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), tagged());
      const dialog = await popover();
      expect(within(dialog).getByText("Already in your library")).toBeTruthy();
      expect(importButton()).toHaveProperty("disabled", true);
      await userEvent.click(within(dialog).getByRole("link", { name: "Open" }));
      expect(await screen.findByText("Editor route")).toBeTruthy();
      expect(location.pathname).toBe("/diapason/recording/t1");
      expect(vi.mocked(putRecording)).not.toHaveBeenCalled();
    });

    it("imports the good files when one is untagged", async () => {
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), [tagged(), plain()]);
      await popover();
      await userEvent.click(screen.getByRole("button", { name: "Import 1" }));
      expect(await screen.findByRole("heading", { name: "Shared" })).toBeTruthy();
      expect(vi.mocked(putRecording)).toHaveBeenCalledTimes(1);
    });

    it("shows a drop area while files are dragged over the library", async () => {
      renderLibrary();
      await screen.findByText(/No recordings yet/);
      expect(screen.queryByText("Drop Diapason WAV or MIDI files to import")).toBeNull();
      fireEvent.dragEnter(libraryRoot(), { dataTransfer: { types: ["Files"] } });
      expect(screen.getByText("Drop Diapason WAV or MIDI files to import")).toBeTruthy();
      fireEvent.dragLeave(libraryRoot(), { dataTransfer: { types: ["Files"] } });
      expect(screen.queryByText("Drop Diapason WAV or MIDI files to import")).toBeNull();
      fireEvent.dragEnter(libraryRoot(), { dataTransfer: { types: ["text/plain"] } });
      expect(screen.queryByText("Drop Diapason WAV or MIDI files to import")).toBeNull();
      fireEvent.dragEnter(libraryRoot(), { dataTransfer: { types: ["Files"] } });
      fireEvent.drop(libraryRoot(), { dataTransfer: { files: [tagged()], types: ["Files"] } });
      expect(screen.queryByText("Drop Diapason WAV or MIDI files to import")).toBeNull();
    });

    it("moves focus into the popover", async () => {
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), tagged());
      await popover();
      await waitFor(() => expect(document.activeElement).toBe(importButton()));
    });

    it("reports a failed save and still lists what was saved", async () => {
      vi.mocked(putRecording)
        .mockImplementationOnce(async (record: Recording) => {
          recordings = [...recordings, record];
        })
        .mockRejectedValueOnce(new Error("QuotaExceededError"));
      renderLibrary();
      await userEvent.upload(screen.getByLabelText("Import WAV or MIDI"), [
        tagged("t1", "First"),
        tagged("t2", "Second"),
      ]);
      await popover();
      await userEvent.click(screen.getByRole("button", { name: "Import 2" }));
      expect((await screen.findByRole("alert")).textContent).toBe(
        "Saved 1 of 2 recordings: QuotaExceededError",
      );
      expect(await screen.findByRole("heading", { name: "First" })).toBeTruthy();
    });

    it("refuses files that are known not to be WAVs", async () => {
      renderLibrary();
      await screen.findByText(/No recordings yet/);
      const png = { kind: "file", type: "image/png" };
      fireEvent.dragEnter(libraryRoot(), { dataTransfer: { types: ["Files"], items: [png] } });
      expect(screen.getByText("Only Diapason WAV and MIDI files can be imported")).toBeTruthy();
      const over = { types: ["Files"], items: [png], dropEffect: "copy" };
      fireEvent.dragOver(libraryRoot(), { dataTransfer: over });
      expect(over.dropEffect).toBe("none");
      const image = new File(["x"], "photo.png", { type: "image/png" });
      fireEvent.drop(libraryRoot(), { dataTransfer: { files: [image], types: ["Files"] } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.queryByText("Only Diapason WAV and MIDI files can be imported")).toBeNull();
    });

    it("accepts drags whose type the browser does not report yet", async () => {
      renderLibrary();
      await screen.findByText(/No recordings yet/);
      const unknown = { kind: "file", type: "" };
      fireEvent.dragEnter(libraryRoot(), { dataTransfer: { types: ["Files"], items: [unknown] } });
      expect(screen.getByText("Drop Diapason WAV or MIDI files to import")).toBeTruthy();
      const mixed = [
        { kind: "file", type: "image/png" },
        { kind: "file", type: "audio/x-wav" },
      ];
      fireEvent.dragLeave(libraryRoot(), { dataTransfer: { types: ["Files"] } });
      fireEvent.dragEnter(libraryRoot(), { dataTransfer: { types: ["Files"], items: mixed } });
      expect(screen.getByText("Drop Diapason WAV or MIDI files to import")).toBeTruthy();
      const untyped = new File([encodeWav(pcm, 48000)], "take.wav");
      fireEvent.drop(libraryRoot(), { dataTransfer: { files: [untyped], types: ["Files"] } });
      expect(await popover()).toBeTruthy();
    });

    it("accepts drops anywhere below the header while the library is open", async () => {
      renderLibrary();
      await screen.findByText(/No recordings yet/);
      fireEvent.dragEnter(document.body, { dataTransfer: { types: ["Files"] } });
      expect(screen.getByText("Drop Diapason WAV or MIDI files to import")).toBeTruthy();
      fireEvent.drop(document.body, { dataTransfer: { files: [tagged()], types: ["Files"] } });
      expect(within(await popover()).getByText("Shared")).toBeTruthy();
    });

    it("does not accept drops on the header", async () => {
      const header = document.body.appendChild(document.createElement("header"));
      header.className = "workstation-header";
      try {
        renderLibrary();
        await screen.findByText(/No recordings yet/);
        fireEvent.dragEnter(header, { dataTransfer: { types: ["Files"] } });
        expect(screen.queryByText("Drop Diapason WAV or MIDI files to import")).toBeNull();
        const over = { types: ["Files"], dropEffect: "copy" };
        expect(fireEvent.dragOver(header, { dataTransfer: over })).toBe(false);
        expect(over.dropEffect).toBe("none");
        fireEvent.drop(header, { dataTransfer: { files: [tagged()], types: ["Files"] } });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(screen.queryByRole("dialog")).toBeNull();
      } finally {
        header.remove();
      }
    });

    it("ignores drops without files", async () => {
      renderLibrary();
      await screen.findByText(/No recordings yet/);
      fireEvent.drop(libraryRoot(), { dataTransfer: { files: [], types: ["text/plain"] } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(vi.mocked(putRecording)).not.toHaveBeenCalled();
    });
  });
});
