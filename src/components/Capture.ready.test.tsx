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
} from "../../tests/support/capture";
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
  expect(screen.getByRole("button", { name: "Edit Measure room noise" }).textContent).toContain(
    "-60 dB",
  );
  expect(screen.queryByLabelText("Tempo (BPM)")).toBeNull();
  await click("Check my sound");
  advance(2000, true);
  expect(screen.getByLabelText("Tempo (BPM)")).toBeTruthy();
  advance(4000);
  expect(screen.getByRole("button", { name: "Edit Check your sound" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "90" } });
  await click("Confirm tempo");
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("invalidates room and sound on gain edits while retaining tempo", async () => {
  await calibratedCapture();
  await click("Edit Set up your microphone");
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "2" } });
  expect(screen.getByRole("button", { name: "Measure room noise" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Record" })).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("");
});
it("requires acknowledgment for unknown processing and blocks enabled processing", async () => {
  fixture.settings = { echoCancellation: true };
  renderCapture();
  await click("Continue with whistling");
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
  fireEvent.click(screen.getByLabelText(/Continue with unverified/));
  await click("Confirm microphone");
  await click("Measure room noise");
  advance(1500);
  await click("Check my sound");
  advance(2000, true);
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "90" } });
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
  await click("Edit Set up your microphone");
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "20" } });
  expect(screen.getByRole("button", { name: "Measure room noise" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "1" } });
  expect((screen.getByLabelText(/Input gain/) as HTMLInputElement).value).toBe("1");
});

it("has no tempo until chosen and keeps gain in microphone and room setup", async () => {
  renderCapture();
  expect(screen.queryByText(/BPM/)).toBeNull();
  expect(screen.queryByLabelText(/Input gain/)).toBeNull();
  await click("Continue with whistling");
  expect(screen.getByLabelText(/Input gain/).closest(".setup-step")?.textContent).toContain(
    "Set up your microphone",
  );
  await click("Confirm microphone");
  expect(screen.getByLabelText(/Input gain/).closest(".setup-step")?.textContent).toContain(
    "Measure room noise",
  );
  await click("Measure room noise");
  advance(1500);
  await click("Check my sound");
  advance(2000, true);
  expect((screen.getByLabelText("Tempo (BPM)") as HTMLInputElement).value).toBe("");
  expect(
    (screen.getByRole("button", { name: "Confirm tempo" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(screen.queryByLabelText(/Input gain/)).toBeNull();
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "120" } });
  expect(screen.getByText(/Preview grid · 120 BPM/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "5" } });
  expect(screen.queryByText(/Preview grid/)).toBeNull();
});

it("keeps initial gain setup in the microphone step without calibration instructions", async () => {
  renderCapture();
  await click("Continue with whistling");
  fireEvent.change(screen.getByLabelText(/Input gain/), { target: { value: "2" } });
  expect(screen.getByRole("status").textContent).toBe("");
  expect(screen.getByRole("button", { name: "Confirm microphone" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Measure room noise" })).toBeNull();
});
