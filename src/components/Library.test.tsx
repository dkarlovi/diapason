import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Library } from "./Library";
import type { Recording } from "../db";

let takes: Recording[] = [];

vi.mock("../db", () => ({
  allRecordings: vi.fn(async () => takes),
  storageEstimate: vi.fn(async () => null),
  getRecording: vi.fn(async (id: string) => takes.find((take) => take.id === id)),
  putRecording: vi.fn(async (take: Recording) => {
    takes = [...takes, take];
  }),
  deleteRecording: vi.fn(),
}));

beforeEach(() => {
  takes = [];
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
    expect(await screen.findByText(/No takes yet/)).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: /New recording/ }));
    await waitFor(() => expect(location.pathname).toBe("/diapason/new"));
    expect(await screen.findByText("Capture route")).toBeTruthy();
    expect(location.hash).toBe("");
  });

  it("duplicates a take and shows the new card", async () => {
    takes = [
      {
        id: "first",
        name: "Melody",
        createdAt: 1,
        sampleRate: 48000,
        durationSec: 2,
        bpm: 90,
        beatsPerBar: 4,
        audio: new Blob(),
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
    await userEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    expect(await screen.findByText("Melody (copy)")).toBeTruthy();
  });
});
