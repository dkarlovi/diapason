import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  advance,
  calibratedCapture,
  click,
  fixture,
  microphoneReady,
  renderCapture,
  resetFixture,
} from "../../tests/capture-fixture";
beforeEach(resetFixture);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("reveals steps in order, requires sound and tempo, and retains calibration after silence", async () => {
  renderCapture();
  expect(screen.queryByRole("button", { name: "Connect microphone" })).toBeNull();
  expect(screen.queryByLabelText("Tempo (BPM)")).toBeNull();
  await microphoneReady();
  await click("Measure room noise");
  advance(1500);
  expect(screen.getByText(/Low room noise/)).toBeTruthy();
  expect(screen.queryByLabelText("Tempo (BPM)")).toBeNull();
  await click("Check my sound");
  advance(2000, true);
  expect(screen.getByLabelText("Tempo (BPM)")).toBeTruthy();
  advance(4000);
  expect(screen.getByRole("heading", { name: /Check your sound/ })).toBeTruthy();
  await click("Confirm tempo");
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("invalidates room and sound on gain edits while retaining tempo", async () => {
  await calibratedCapture();
  await click("Edit Check your sound");
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "2" } });
  expect(screen.getByRole("button", { name: "Measure room noise" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(screen.getByText(/Gain changed/)).toBeTruthy();
});
it("requires acknowledgment for unknown processing and blocks enabled processing", async () => {
  fixture.settings = { echoCancellation: true };
  renderCapture();
  await click("Continue with whistling");
  await click("Connect microphone");
  expect(
    (screen.getByRole("button", { name: "Confirm microphone" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fixture.settings = {};
  await click("Reconnect microphone");
  expect(screen.getAllByText(/Unknown/).length).toBe(3);
  fireEvent.click(screen.getByLabelText(/Continue with unverified/));
  await click("Confirm microphone");
  expect(screen.getByRole("button", { name: "Measure room noise" })).toBeTruthy();
});
it("does not pass room measurement without audio samples", async () => {
  renderCapture();
  await microphoneReady();
  await click("Measure room noise");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(screen.getByText(/Not enough audio/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Check my sound" })).toBeNull();
});
it("returns to microphone setup on disconnect", async () => {
  await calibratedCapture();
  act(() => fixture.ended?.());
  expect(screen.getByRole("button", { name: "Connect microphone" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
});

it("does not show an uncompleted measurement as passed while editing earlier setup", async () => {
  renderCapture();
  await microphoneReady();
  await click("Edit Set up your microphone");
  expect(screen.queryByText(/Low room noise · Measurement passed/)).toBeNull();
});
it("revokes microphone readiness when unknown-setting acknowledgment is withdrawn", async () => {
  fixture.settings = {};
  renderCapture();
  await click("Continue with whistling");
  await click("Connect microphone");
  fireEvent.click(screen.getByLabelText(/Continue with unverified/));
  await click("Confirm microphone");
  await click("Measure room noise");
  advance(1500);
  await click("Check my sound");
  advance(2000, true);
  await click("Confirm tempo");
  await click("Edit Set up your microphone");
  fireEvent.click(screen.getByLabelText(/Continue with unverified/));
  const done = screen.queryByRole("button", { name: "Done editing" });
  if (done) fireEvent.click(done);
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Confirm microphone" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});

it("keeps gain available to recover from an invalidated or noisy room test", async () => {
  await calibratedCapture();
  await click("Edit Check your sound");
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "20" } });
  expect(screen.getByRole("button", { name: "Measure room noise" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "1" } });
  expect((screen.getByLabelText(/Input gain/) as HTMLInputElement).value).toBe("1");
});
