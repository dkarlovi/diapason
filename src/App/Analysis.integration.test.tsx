import "fake-indexeddb/auto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editor } from "../Features/Editor/Editor";
import { Library } from "../Features/Library/Library";
import { putRecording } from "../Recording/Recording.storage";
import { recording } from "../../tests/support/recording";
import { requestAnalysis } from "../Analysis/AnalysisJobs";
import type { AnalysisMessage } from "../Analysis/AnalysisRunner";

vi.mock("../Audio/Codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("../Playback/Playback", () => ({
  playPcm: () => ({ stop() {}, position: () => 0 }),
  playNotes: () => ({ stop() {}, position: () => 0 }),
}));
beforeEach(() =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function controlledWorker() {
  const workers: WorkerDouble[] = [];
  class WorkerDouble {
    onmessage: ((event: { data: AnalysisMessage }) => void) | null = null;
    onerror = null;
    onmessageerror = null;
    postMessage() {}
    terminate() {}
    constructor() {
      workers.push(this);
    }
    emit(data: AnalysisMessage) {
      this.onmessage?.({ data });
    }
  }
  vi.stubGlobal("Worker", WorkerDouble);
  return workers;
}
const result = () => ({
  type: "result" as const,
  frames: Float64Array.from(
    Array.from({ length: 12 }, (_, i) => [i * 0.05, 440, 0.99, 0.1]).flat(),
  ),
});

it("shows advancing editor progress, permits audio, and enables MIDI automatically", async () => {
  const record = recording({ id: "editor-progress", name: "Progress take" });
  await putRecording(record);
  const workers = controlledWorker();
  render(
    <MemoryRouter>
      <Editor id={record.id} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(workers).toHaveLength(1));
  expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Download MIDI" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Toggle Tune" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Play audio" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("button", { name: "Download WAV" }).hasAttribute("disabled")).toBe(true);
  await act(async () => workers[0]!.emit({ type: "progress", done: 42, total: 100 }));
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42");
  expect(screen.getByText("Analyzing… 42%")).toBeTruthy();
  await act(async () => workers[0]!.emit(result()));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false);
  expect(screen.getByRole("button", { name: "Download MIDI" }).hasAttribute("disabled")).toBe(
    false,
  );
  expect(screen.getByText(/1 notes/)).toBeTruthy();
});

it("continues the same analysis across Library navigation, showing its progress on both screens", async () => {
  const record = recording({
    id: "navigation-progress",
    name: "Navigation take",
    waveform: { version: 1, rms: new Float32Array([0, 1]) },
  });
  await putRecording(record);
  const workers = controlledWorker();
  const work = requestAnalysis(record);
  const view = render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/recording/:id" element={<Editor id={record.id} />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => expect(workers).toHaveLength(1));
  await act(async () => workers[0]!.emit({ type: "progress", done: 2, total: 5 }));
  const row = (await screen.findByRole("heading", { name: record.name })).closest("article")!;
  expect(row.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("40");
  expect(row.querySelector("a")!.getAttribute("aria-disabled")).toBe("true");
  view.unmount();
  render(
    <MemoryRouter>
      <Editor id={record.id} />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue(record.name);
  expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");
  expect(workers).toHaveLength(1);
  await act(async () => workers[0]!.emit(result()));
  await work;
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("shows an analysis failure with a working retry", async () => {
  const record = recording({ id: "editor-retry", name: "Retry take" });
  await putRecording(record);
  const workers = controlledWorker();
  render(
    <MemoryRouter>
      <Editor id={record.id} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(workers).toHaveLength(1));
  await act(async () => workers[0]!.emit({ type: "error", error: "Detector failed" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    expect.stringContaining("Detector failed"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry analysis" }));
  await waitFor(() => expect(workers).toHaveLength(2));
  await act(async () => workers[1]!.emit(result()));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Play MIDI" }).hasAttribute("disabled")).toBe(false),
  );
});
