import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { calibratedCapture, click, fixture, resetFixture } from "../../tests/capture-fixture";
beforeEach(resetFixture);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("saves downbeat-trimmed audio and explicit calibration/source settings", async () => {
  await calibratedCapture();
  await click("Record");
  expect(fixture.start).toHaveBeenCalledOnce();
  expect(screen.getByText("Counting in…")).toBeTruthy();
  act(() => fixture.metro?.onDownbeat?.());
  await click("Stop & save");
  expect(fixture.saved).toMatchObject({
    sampleRate: 48000,
    durationSec: 0.8,
    bpm: 90,
    beatsPerBar: 4,
    source: { profileId: "whistle", analysis: { minFreq: 250, maxFreq: 3000 } },
    capture: { gain: 1, noiseFloor: 0.001, rmsGate: 0.003, dspOff: true },
    melody: { preset: "clean", key: "auto", overrides: { levelGate: 0.003 } },
  });
  expect(fixture.saved?.name).toMatch(/^Recording /);
});
it("locks record and device edits while starting audio", async () => {
  await calibratedCapture();
  let release!: () => void;
  fixture.resumePending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await click("Record");
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Edit Set up your microphone" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(fixture.start).not.toHaveBeenCalled();
  await act(async () => {
    release();
  });
  expect(fixture.start).toHaveBeenCalledOnce();
});
it.each(["encode", "recorder"])("allows retry after %s failure", async (kind) => {
  await calibratedCapture();
  fixture.encodeFailure = kind === "encode";
  fixture.recorderFailure = kind === "recorder";
  await click("Record");
  if (kind === "encode") await click("Stop & save");
  expect(
    screen.getByText(
      kind === "encode" ? /Save error: storage failed/ : /Record error: worklet unavailable/,
    ),
  ).toBeTruthy();
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("rejects a recording that stops before the downbeat", async () => {
  await calibratedCapture();
  fixture.pcm = new Float32Array(100);
  await click("Record");
  await click("Stop & save");
  expect(screen.getByText(/Too short/)).toBeTruthy();
  expect(fixture.saved).toBeNull();
});
it("disposes a recorder resolving after unmount", async () => {
  const view = await calibratedCapture();
  let release!: (recorder: import("../recorder").Recorder) => void;
  fixture.recorderPending = new Promise((resolve) => {
    release = resolve;
  });
  await click("Record");
  view.unmount();
  await act(async () => {
    release({ start: fixture.start, stop: () => fixture.pcm, dispose: fixture.dispose });
  });
  expect(fixture.start).not.toHaveBeenCalled();
  expect(fixture.dispose).toHaveBeenCalledOnce();
});
it("does not start after unmount while resuming context", async () => {
  const view = await calibratedCapture();
  let release!: () => void;
  fixture.resumePending = new Promise((resolve) => {
    release = resolve;
  });
  await click("Record");
  view.unmount();
  await act(async () => {
    release();
  });
  expect(fixture.start).not.toHaveBeenCalled();
  expect(fixture.closeMic).toHaveBeenCalledOnce();
});
it("releases metronome and recorder before the microphone closes", async () => {
  const view = await calibratedCapture();
  await click("Record");
  view.unmount();
  expect(fixture.dispose).toHaveBeenCalledOnce();
  expect(fixture.stopMetro).toHaveBeenCalledOnce();
  expect(fixture.closeMic).toHaveBeenCalledOnce();
  expect(fixture.dispose.mock.invocationCallOrder[0]).toBeLessThan(
    fixture.closeMic.mock.invocationCallOrder[0]!,
  );
});
