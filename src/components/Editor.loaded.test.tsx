import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Recording } from "../db";
import { Editor } from "./Editor";
import { AppShell } from "./AppShell";

let saved: Recording | null = null;
const recording: Recording = {
  id: "one",
  name: "Melody",
  createdAt: 1,
  sampleRate: 48000,
  durationSec: 1,
  bpm: 120,
  beatsPerBar: 4,
  audio: new Blob(),
  capture: { gain: 1, peak: 0.2, noiseFloor: 0.003, dspOff: true },
  tuning: {},
};
vi.mock("../db", () => ({
  getRecording: async () => recording,
  putRecording: async (next: Recording) => {
    saved = next;
  },
  deleteRecording: async () => undefined,
}));
vi.mock("../playback", () => ({
  playNotes: () => ({ position: () => null, stop() {} }),
  playPcm: () => ({ position: () => null, stop() {} }),
}));
vi.mock("../codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("../recorder", async (importOriginal) => {
  const original = await importOriginal<typeof import("../recorder")>();
  return {
    ...original,
    analyzeBuffer: () =>
      Array.from({ length: 12 }, (_, i) => ({ t: i * 0.05, freq: 440, clarity: 0.99, rms: 0.1 })),
  };
});
vi.mock("../trace", async (importOriginal) => {
  const original = await importOriginal<typeof import("../trace")>();
  return { ...original, drawTrace: () => undefined };
});

beforeEach(() => {
  saved = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("loads a recording and applies a melody preset through React controls", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  expect(screen.getByText(/1 notes/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Choose preset"));
  fireEvent.click(screen.getByRole("button", { name: "Use Gentle fix" }));
  await waitFor(() =>
    expect(saved?.melody).toEqual({ preset: "gentle", overrides: {}, key: "auto" }),
  );
});

it("keeps one recording title above paired audio and MIDI canvas regions", async () => {
  render(
    <MemoryRouter initialEntries={["/recording/one"]}>
      <AppShell>
        <Editor id="one" />
      </AppShell>
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  await screen.findByRole("heading", { name: "Melody" });
  expect(screen.getAllByRole("heading", { name: "Melody" })).toHaveLength(1);
  const audio = screen.getByRole("region", { name: "Original recording" });
  const midi = screen.getByRole("region", { name: "MIDI melody" });
  expect(audio.querySelector("canvas")).toBeTruthy();
  expect(midi.querySelector("canvas")).toBeTruthy();
  expect(audio.querySelector("input")).toBeNull();
  expect(midi.querySelector("select")).toBeNull();
  expect(screen.getByRole("button", { name: "Download WAV" }).closest("section")).toBe(audio);
  expect(screen.getByRole("button", { name: "Download MIDI" }).closest("section")).toBe(midi);
});

it("saves a renamed recording on blur", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  const name = await screen.findByDisplayValue("Melody");
  fireEvent.change(name, { target: { value: "New name" } });
  fireEvent.blur(name);
  await waitFor(() => expect(saved?.name).toBe("New name"));
});

it("keeps a new name when the tuning save fires later", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  const name = await screen.findByDisplayValue("Melody");
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Detection" }));
  fireEvent.change(screen.getByLabelText("Minimum note length"), { target: { value: "120" } });
  fireEvent.change(name, { target: { value: "Renamed" } });
  fireEvent.blur(name);
  expect(saved?.name).toBe("Renamed");
  act(() => vi.advanceTimersByTime(300));
  expect(saved?.name).toBe("Renamed");
  expect(saved?.melody?.overrides.minNoteMs).toBe(120);
});

it("saves a tuning change when leaving before the debounce delay", async () => {
  render(
    <MemoryRouter initialEntries={["/recording/one"]}>
      <Routes>
        <Route path="/recording/:id" element={<Editor id="one" />} />
        <Route path="/" element={<div>Library route</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.click(screen.getByRole("button", { name: "Detection" }));
  fireEvent.change(screen.getByLabelText("Minimum note length"), { target: { value: "120" } });
  fireEvent.click(screen.getByRole("link", { name: /Library/ }));
  expect(screen.getByText("Library route")).toBeTruthy();
  expect(saved?.melody?.overrides.minNoteMs).toBe(120);
});

it("mutes a note through the MIDI roll", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const roll = screen.getByTitle(/Click a note to hear it/) as HTMLCanvasElement;
  roll.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
    right: 100,
    bottom: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  fireEvent.click(roll, { clientX: 25, clientY: 67, ctrlKey: true });
  await waitFor(() => expect(saved?.muted).toMatchObject([{ midi: 69 }]));
  expect(screen.getByText(/0 notes · 1 muted/)).toBeTruthy();
});

it("provides a resizable Tune overlay and a removable original track", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const divider = screen.getByRole("separator", { name: "Resize Tune sidebar" });
  expect(divider.getAttribute("aria-orientation")).toBe("vertical");
  fireEvent.click(screen.getByRole("button", { name: "Hide original" }));
  expect(screen.queryByRole("region", { name: "Original recording" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show original" }));
  expect(screen.getByRole("region", { name: "Original recording" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close Tune" }));
  expect(screen.queryByRole("region", { name: "Tune melody" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open Tune" }));
  expect(screen.getByRole("region", { name: "Tune melody" })).toBeTruthy();
  expect(screen.queryByText("Notes")).toBeNull();
});

it("keeps panning available at 1× while Tune obscures the ending", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  expect(screen.getByLabelText("Pan shared timeline").closest("label")?.hidden).toBe(false);
});
it("starts mobile with original audio and Tune closed", async () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("760px"),
    addEventListener() {},
    removeEventListener() {},
  }));
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  expect(screen.queryByRole("region", { name: "Original recording" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Tune melody" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open Tune" })).toBeTruthy();
});
it("allows keyboard note selection and contextual muting without a note list", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const roll = screen.getByRole("img", { name: "MIDI piano roll" });
  fireEvent.keyDown(roll, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "Hear in context" })).toBeTruthy();
  fireEvent.keyDown(roll, { key: "m" });
  await waitFor(() => expect(saved?.muted).toMatchObject([{ midi: 69 }]));
  expect(screen.getByRole("button", { name: "Unmute" })).toBeTruthy();
});
