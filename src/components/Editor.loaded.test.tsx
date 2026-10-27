import userEvent from "@testing-library/user-event";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Recording } from "../db";
import { Editor } from "./Editor";
import { AppShell } from "./AppShell";

let saved: Recording | null = null;
let playPosition: number | null = null;
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
  playNotes: () => ({ position: () => playPosition, stop() {} }),
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
  playPosition = null;
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

it("groups playback separately from the preset, key, and the controls they shape", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const playback = screen.getByRole("region", { name: "Playback sound" });
  const correction = screen.getByRole("region", { name: "Melody correction" });
  expect(within(playback).getByRole("button", { name: "Choose instrument" })).toBeTruthy();
  expect(within(playback).getByRole("button", { name: "Choose octave" })).toBeTruthy();
  expect(within(playback).queryByRole("button", { name: "Choose key" })).toBeNull();
  const preset = within(correction).getByRole("button", { name: "Choose preset" });
  const key = within(correction).getByRole("button", { name: "Choose key" });
  const categories = within(correction).getByRole("navigation", { name: "Tuning category" });
  expect(
    playback.compareDocumentPosition(correction) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(preset.compareDocumentPosition(key) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(key.compareDocumentPosition(categories) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(within(playback).getByRole("button", { name: "Choose instrument" }));
  fireEvent.click(screen.getByRole("button", { name: "Use Instrument Flute" }));
  fireEvent.click(key);
  fireEvent.click(screen.getByRole("button", { name: "Use key G major" }));
  fireEvent.click(preset);
  fireEvent.click(screen.getByRole("button", { name: "Use Clean" }));
  expect((within(correction).getByLabelText("Steadiness") as HTMLInputElement).value).toBe("1");
  expect(saved?.play?.instrument).toBe("flute");
  expect(saved?.melody?.key).toEqual({ tonic: 7, mode: "major" });
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
  fireEvent.click(screen.getByRole("button", { name: "Toggle Tune" }));
  expect(screen.getByRole("region", { name: "Tune melody" })).toBeTruthy();
  const tune = screen.getByRole("button", { name: "Toggle Tune" });
  expect(tune.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(tune);
  expect(screen.queryByRole("region", { name: "Tune melody" })).toBeNull();
  expect(tune.getAttribute("aria-pressed")).toBe("false");
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
  const tune = screen.getByRole("button", { name: "Toggle Tune" });
  const controls = tune.parentElement!;
  expect(
    [...controls.querySelectorAll("button")].map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Toggle Tune", "Play MIDI", "Download MIDI"]);
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
  const mute = screen.getByRole("button", { name: "Mute note" });
  expect(mute.getAttribute("aria-pressed")).toBe("false");
  fireEvent.keyDown(roll, { key: "m" });
  await waitFor(() => expect(saved?.muted).toMatchObject([{ midi: 69 }]));
  expect(screen.getByRole("button", { name: "Mute note" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});

it("dismisses recording actions outside and with Escape", async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.click(screen.getByLabelText("Recording actions"));
  expect(screen.getByRole("button", { name: "Download JSON" })).toBeTruthy();
  await user.click(document.body);
  expect(screen.queryByRole("button", { name: "Download JSON" })).toBeNull();
  fireEvent.click(screen.getByLabelText("Recording actions"));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "Download JSON" })).toBeNull();
});
it("identifies selected notes once and dismisses on Escape or empty canvas", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const roll = screen.getByRole("img", { name: "MIDI piano roll" });
  fireEvent.keyDown(roll, { key: "ArrowRight" });
  const detail = screen.getByRole("dialog", { name: "Note #1 A4" });
  expect(within(detail).getByText("#1 · A4")).toBeTruthy();
  expect(within(detail).getAllByText(/Note #1|#1 ·/)).toHaveLength(1);
  expect(within(detail).queryByRole("button", { name: /copy/i })).toBeNull();
  expect(document.activeElement).toBe(roll);
  expect(
    document.querySelector(".editor-note-anchor")?.classList.contains("editor-note-active"),
  ).toBe(true);
  fireEvent.keyDown(roll, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Note #1 A4" })).toBeNull();
  fireEvent.keyDown(roll, { key: "Home" });
  expect(screen.getByRole("dialog", { name: "Note #1 A4" })).toBeTruthy();
  fireEvent.click(roll, { clientX: 0, clientY: 0 });
  expect(screen.queryByRole("dialog", { name: "Note #1 A4" })).toBeNull();
});
it("keeps the inspector's controls and rows stable while toggling and editing", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.keyDown(screen.getByRole("img", { name: "MIDI piano roll" }), { key: "Home" });
  const names = () =>
    [...document.querySelectorAll(".editor-note-detail button")].map((button) =>
      button.getAttribute("aria-label"),
    );
  const before = names();
  expect(before).toEqual([
    "Hear in context",
    "Mute note",
    "Down one semitone",
    "Up one semitone",
    "Reset pitch",
  ]);
  const row = () => document.querySelector(".editor-note-property") as HTMLElement;
  expect(row().dataset.edited).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Mute note" }));
  fireEvent.click(screen.getByRole("button", { name: "Up one semitone" }));
  expect(names()).toEqual(before);
  expect(row().dataset.edited).toBe("true");
  expect(within(row()).getByText(", edited")).toBeTruthy();
});
it("asks before resetting Tune and preserves changes when cancelled", async () => {
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.change(screen.getByLabelText("Steadiness"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(confirm).toHaveBeenCalledOnce();
  expect((screen.getByLabelText("Steadiness") as HTMLInputElement).value).toBe("0.9");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect((screen.getByLabelText("Steadiness") as HTMLInputElement).value).not.toBe("0.9");
});

it("previews playback settings without saving, then applies the chosen option", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.click(screen.getByRole("button", { name: "Choose octave" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview Octave −1 octave" }));
  expect(screen.getByRole("button", { name: "Choose octave" }).textContent).toBe("Original octave");
  expect(screen.getByRole("button", { name: "Use Octave −1 octave" })).toBeTruthy();
  expect(saved).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Use Octave −1 octave" }));
  expect(saved?.play?.octave).toBe(-1);
  expect(screen.queryByRole("button", { name: "Use Octave −1 octave" })).toBeNull();
});

it("exposes the phone roll while auditioning and restores the candidate menu on return", async () => {
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
  fireEvent.click(screen.getByRole("button", { name: "Toggle Tune" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose preset" }));
  fireEvent.click(screen.getByRole("button", { name: "Play Gentle fix" }));
  expect(screen.queryByRole("region", { name: "Tune melody" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Use Gentle fix" })).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("img", { name: "MIDI piano roll" })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Toggle Tune" }));
  expect(screen.getByRole("button", { name: "Use Gentle fix" })).toBeTruthy();
});

it("offers an explicit scoped reset and can restore the replaced tuning", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  expect(screen.queryByRole("button", { name: "Preset" })).toBeNull();
  fireEvent.change(screen.getByLabelText("Steadiness"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset steadiness" }));
  expect((screen.getByLabelText("Steadiness") as HTMLInputElement).value).not.toBe("0.9");
  fireEvent.click(screen.getByRole("button", { name: "Undo tuning change" }));
  expect((screen.getByLabelText("Steadiness") as HTMLInputElement).value).toBe("0.9");
});

it("toggles context playback between Play and Stop", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.keyDown(screen.getByRole("img", { name: "MIDI piano roll" }), { key: "Home" });
  const play = screen.getByRole("button", { name: "Hear in context" });
  expect(play.querySelector(".lucide-play")).toBeTruthy();
  fireEvent.click(play);
  const stop = screen.getByRole("button", { name: "Stop context playback" });
  expect(stop.querySelector(".lucide-square")).toBeTruthy();
  fireEvent.click(stop);
  expect(screen.getByRole("button", { name: "Hear in context" })).toBeTruthy();
});
it("edits pitch rapidly, preserves pending tuning and clears the edit when stepping back to the detected pitch", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const roll = screen.getByRole("img", { name: "MIDI piano roll" });
  fireEvent.keyDown(roll, { key: "Home" });
  expect((screen.getByRole("button", { name: "Reset pitch" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  vi.useFakeTimers();
  fireEvent.change(screen.getByLabelText("Steadiness"), { target: { value: "0.9" } });
  fireEvent.click(screen.getByRole("button", { name: "Up one semitone" }));
  fireEvent.click(screen.getByRole("button", { name: "Up one semitone" }));
  fireEvent.click(screen.getByRole("button", { name: "Down one semitone" }));
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(70);
  expect(saved?.noteEdits?.pitch[0]?.ranges).toEqual([{ start: 0, end: 0.6000000000000001 }]);
  act(() => vi.advanceTimersByTime(300));
  expect(saved?.melody?.overrides.steadiness).toBe(0.9);
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(70);
  expect(screen.getByRole("button", { name: "Reset pitch" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reset pitch" }));
  expect(saved?.noteEdits).toEqual({ version: 1, pitch: [] });
  fireEvent.click(screen.getByRole("button", { name: "Up one semitone" }));
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(70);
  fireEvent.click(screen.getByRole("button", { name: "Down one semitone" }));
  expect(saved?.noteEdits).toEqual({ version: 1, pitch: [] });
  expect((screen.getByRole("button", { name: "Reset pitch" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
it("keeps edited muted notes and confirms only bulk reset", async () => {
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal("confirm", confirm);
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  fireEvent.keyDown(screen.getByRole("img", { name: "MIDI piano roll" }), { key: "Home" });
  fireEvent.click(screen.getByRole("button", { name: "Mute note" }));
  fireEvent.click(screen.getByRole("button", { name: "Up one semitone" }));
  expect(saved?.muted).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Mute note" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByLabelText("Recording actions"));
  fireEvent.click(screen.getByRole("button", { name: "Reset all note edits" }));
  expect(saved?.noteEdits?.pitch).toHaveLength(1);
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Reset all note edits" }));
  expect(saved?.noteEdits?.pitch).toHaveLength(0);
  expect(saved?.muted).toHaveLength(1);
});
it("docks the note inspector on phones and never shows it together with Tune", async () => {
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
  const roll = screen.getByRole("img", { name: "MIDI piano roll" });
  fireEvent.click(screen.getByRole("button", { name: "Toggle Tune" }));
  expect(screen.getByRole("region", { name: "Tune melody" })).toBeTruthy();
  fireEvent.keyDown(roll, { key: "Home" });
  const sheet = screen.getByRole("dialog", { name: "Note #1 A4" });
  expect(sheet.classList.contains("editor-note-sheet")).toBe(true);
  expect(screen.queryByRole("region", { name: "Tune melody" })).toBeNull();
  fireEvent.keyDown(within(sheet).getByRole("button", { name: "Mute note" }), { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Note #1 A4" })).toBeNull();
  fireEvent.keyDown(roll, { key: "Home" });
  fireEvent.click(screen.getByRole("button", { name: "Toggle Tune" }));
  expect(screen.queryByRole("dialog", { name: "Note #1 A4" })).toBeNull();
  expect(screen.getByRole("region", { name: "Tune melody" })).toBeTruthy();
});
it("changes the selected note's pitch with arrow keys and by dragging it vertically", async () => {
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const roll = screen.getByRole("img", { name: "MIDI piano roll" }) as HTMLCanvasElement;
  fireEvent.keyDown(roll, { key: "ArrowUp" });
  expect(saved?.noteEdits).toBeUndefined();
  fireEvent.keyDown(roll, { key: "Home" });
  fireEvent.keyDown(roll, { key: "ArrowUp" });
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(70);
  fireEvent.keyDown(roll, { key: "ArrowUp", shiftKey: true });
  expect(saved?.noteEdits?.pitch[0]?.midi).toBe(82);
  fireEvent.keyDown(roll, { key: "ArrowDown", shiftKey: true });
  fireEvent.keyDown(roll, { key: "ArrowDown" });
  expect(saved?.noteEdits?.pitch).toEqual([]);

  const rect = { left: 0, top: 0, width: 1000, height: 500 };
  roll.getBoundingClientRect = () => rect as DOMRect;
  Object.defineProperties(roll, { clientWidth: { value: 1000 }, clientHeight: { value: 500 } });
  act(() => window.dispatchEvent(new Event("resize")));
  const pointer = (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, cancelable: true, bubbles: true });
    Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
    act(() => roll.dispatchEvent(event));
  };
  const anchor = document.querySelector(".editor-note-anchor") as HTMLElement;
  const x = parseFloat(anchor.style.left) + 10;
  const y = parseFloat(anchor.style.top);
  pointer("pointerdown", x, y);
  pointer("pointermove", x, y - 200);
  expect(screen.getByRole("dialog", { name: /Note #1 / }).textContent).not.toContain("A4");
  expect(saved?.noteEdits?.pitch).toEqual([]);
  pointer("pointerup", x, y - 200);
  expect(saved?.noteEdits?.pitch).toHaveLength(1);
  expect(saved?.noteEdits?.pitch[0]?.midi).toBeGreaterThan(69);
});

it("advances the time readout from the playhead and clears it on stop", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Editor id="one" />
    </MemoryRouter>,
  );
  await screen.findByDisplayValue("Melody");
  const midi = screen.getByRole("region", { name: "MIDI melody" });
  expect(within(midi).getByText("0.0 / 1.0 s")).toBeTruthy();
  playPosition = 0.42;
  fireEvent.click(within(midi).getByRole("button", { name: "Play MIDI" }));
  act(() => frames.shift()?.(0));
  expect(within(midi).getByText("0.4 / 1.0 s")).toBeTruthy();
  fireEvent.click(within(midi).getByRole("button", { name: "Stop MIDI" }));
  expect(within(midi).getByText("0.0 / 1.0 s")).toBeTruthy();
});
