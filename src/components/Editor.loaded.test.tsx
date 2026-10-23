import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Recording } from "../db";
import { Editor } from "./Editor";

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
});

it("loads a recording and applies a melody preset through React controls", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  expect(screen.getByText(/1 notes/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Use Gentle fix" }));
  await waitFor(() =>
    expect(saved?.melody).toEqual({ preset: "gentle", overrides: {}, key: "auto" }),
  );
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
