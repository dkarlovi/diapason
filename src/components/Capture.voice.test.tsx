import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { advance, click, fixture, renderCapture, resetFixture } from "../../tests/capture-fixture";

beforeEach(resetFixture);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function readyForVoice() {
  renderCapture();
  fireEvent.change(screen.getByLabelText("What will you record?"), {
    target: { value: "voice-experimental" },
  });
  await click("Continue with singing / humming");
  await click("Confirm microphone");
  await click("Measure room noise");
  advance(1500);
}

async function measureRange() {
  fixture.frequency = 130;
  await click("Measure low note");
  advance(2000, true);
  expect(screen.queryByLabelText("Tempo (BPM)")).toBeNull();
  fixture.frequency = 440;
  await click("Measure high note");
  advance(2000, true);
}

it("restarts an opening microphone with the voice window when changing sources", async () => {
  let release!: () => void;
  fixture.openPending = new Promise<void>((resolve) => {
    release = resolve;
  });
  renderCapture();
  await click("Continue with whistling");
  await click("Back");
  fireEvent.change(screen.getByLabelText("What will you record?"), {
    target: { value: "voice-experimental" },
  });
  await click("Continue with singing / humming");
  expect(fixture.openRequests.map((request) => request.fftSize)).toEqual([2048, 4096]);
  await act(async () => release());
  await click("Confirm microphone");
  await click("Measure room noise");
  advance(1500);
  expect(screen.getByRole("button", { name: "Measure low note" })).toBeTruthy();
});

it("calibrates low and high in the existing step and shows the saved effective range", async () => {
  await readyForVoice();
  expect(screen.queryByRole("button", { name: "Measure high note" })).toBeNull();
  await measureRange();
  expect(screen.getByLabelText("Tempo (BPM)")).toBeTruthy();
  expect(screen.getByText(/Calibrated range.*109 Hz.*523 Hz/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "90" } });
  await click("Confirm tempo");
  await click("Record");
  advance(1000, true);
  await click("Stop recording");
  expect(fixture.saved?.source?.profileId).toBe("voice-experimental");
  expect(fixture.saved?.source?.analysis.preferredRange?.minFreq).toBeCloseTo(109.3165, 3);
  expect(fixture.saved?.source?.analysis.preferredRange?.maxFreq).toBeCloseTo(523.2511, 3);
});

it("clears the band during a retry and after input changes", async () => {
  await readyForVoice();
  await measureRange();
  await click("Edit Check your sound");
  await click("Retry low note");
  expect(screen.queryByText(/Calibrated range/)).toBeNull();
  fixture.frequency = 140;
  advance(2000, true);
  expect(screen.getByText(/Calibrated range/)).toBeTruthy();
  await click("Edit Set up your microphone");
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "2" } });
  expect(screen.queryByText(/Calibrated range/)).toBeNull();
});

it("offers Continue after a successful range check without inviting replacement calibration", async () => {
  await readyForVoice();
  await measureRange();
  await click("Edit Check your sound");
  expect(screen.queryByRole("button", { name: /Use default range/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  await click("Continue");
  expect(screen.getByLabelText("Tempo (BPM)")).toBeTruthy();
  expect(screen.getByText(/Calibrated range.*109 Hz.*523 Hz/)).toBeTruthy();
});

it("shows a failed low retry even when the previous high measurement passed", async () => {
  await readyForVoice();
  await measureRange();
  await click("Edit Check your sound");
  await click("Retry low note");
  advance(2000);
  expect(screen.getByText(/Hold one comfortable note, then try again/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
});

it("requires a usable sound check when opting for the broad default range", async () => {
  await readyForVoice();
  await click("Use default range and check sound");
  advance(2000);
  expect(screen.queryByLabelText("Tempo (BPM)")).toBeNull();
  await click("Use default range and check sound");
  advance(2000, true);
  expect(screen.getByLabelText("Tempo (BPM)")).toBeTruthy();
  expect(screen.queryByText(/Calibrated range/)).toBeNull();
});
