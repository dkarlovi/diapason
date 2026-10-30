import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  calibratedCapture,
  advance,
  click,
  fixture,
  microphoneReady,
  renderCapture,
  resetFixture,
} from "../../tests/support/capture";

beforeEach(resetFixture);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows six horizontal setup steps without enabling future steps or an initial Back action", () => {
  renderCapture();
  const steps = screen.getByRole("navigation", { name: "Recording steps" });
  expect(steps.querySelectorAll("button")).toHaveLength(6);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: /Step 6: Record/ }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(steps.textContent).not.toContain("NaN");
});

it("opens microphone setup when continuing from sound selection", async () => {
  renderCapture();
  expect(screen.queryByLabelText("Microphone")).toBeNull();
  await click("Continue with whistling");
  expect(screen.getByLabelText("Microphone")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Confirm microphone" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Connect microphone" })).toBeNull();
});

it("allows retrying microphone permission after continuing from sound selection", async () => {
  fixture.denied = true;
  renderCapture();
  await click("Continue with whistling");
  expect(screen.getByRole("alert").textContent).toContain("permission denied");
  fixture.denied = false;
  await click("Connect microphone");
  expect(screen.getByLabelText("Microphone")).toBeTruthy();
});

it("shows elapsed progress during room and sound measurements", async () => {
  renderCapture();
  await microphoneReady();
  await click("Measure room noise");
  const room = screen.getByRole("progressbar", {
    name: "Measuring… stay silent",
  }) as HTMLProgressElement;
  expect(room.value).toBe(0);
  advance(750);
  expect(room.value).toBeCloseTo(0.5, 1);
  advance(750);
  expect(screen.queryByRole("progressbar")).toBeNull();
  await click("Check my sound");
  const sound = screen.getByRole("progressbar", {
    name: "Checking… keep sounding",
  }) as HTMLProgressElement;
  expect(sound.value).toBe(0);
  advance(1000, true);
  expect(sound.value).toBeCloseTo(0.5, 1);
  advance(1000, true);
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("keeps the live canvas and record toggle mounted while the wizard folds and restores", async () => {
  await calibratedCapture();
  fixture.pcm = new Float32Array(100);
  const canvas = screen.getByRole("img");
  const toggle = screen.getByRole("button", { name: "Record" });
  const recordStep = screen.getByRole("button", { name: "Step 6: Record" });
  expect(recordStep.querySelector("svg")).toBeNull();
  await click("Record");
  expect(recordStep.querySelector("svg")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Stop recording" })).toBe(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(document.querySelector(".capture-recording-brand svg")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(screen.getByRole("img")).toBe(canvas);
  act(() => fixture.metro?.onBeat?.(-4));
  expect(screen.getByRole("group", { name: /Metronome/ }).textContent).toContain("90");
  await click("Stop recording");
  expect(screen.getByRole("button", { name: "Record" })).toBe(toggle);
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(recordStep.querySelector("svg")).toBeNull();
  expect(screen.getByRole("img")).toBe(canvas);
  expect(screen.getByText(/Too short/)).toBeTruthy();
});

it("explains microphone delegation in embedded mode", async () => {
  fixture.denied = true;
  renderCapture("?embed=1");
  await click("Continue with whistling");
  expect(screen.getByRole("alert").textContent).toContain('allow="microphone"');
});
