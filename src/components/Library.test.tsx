import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Library } from "./Library";
import type { Recording } from "../db";
import { decodeAudio } from "../codec";

vi.mock("../codec", () => ({ decodeAudio: vi.fn(async () => new Float32Array([0, 0.5, 1])) }));

let recordings: Recording[] = [];
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

vi.mock("../db", () => ({
  allRecordings: vi.fn(async () => recordings),
  storageEstimate: vi.fn(async () => null),
  getRecording: vi.fn(async (id: string) => recordings.find((recording) => recording.id === id)),
  putRecording: vi.fn(async (recording: Recording) => {
    recordings = [...recordings, recording];
  }),
  deleteRecording: vi.fn(),
  saveWaveform: vi.fn(async () => undefined),
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
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByText("Melody (copy)")).toBeTruthy();
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
});
