import { act, cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  advance,
  calibratedCapture,
  click,
  fixture,
  resetFixture,
} from "../../tests/capture-fixture";
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
  await click("Stop recording");
  expect(fixture.saved).toMatchObject({
    sampleRate: 48000,
    durationSec: 0.8,
    bpm: 90,
    beatsPerBar: 4,
    waveform: { version: 1, rms: expect.any(Float32Array) },
    source: { profileId: "whistle", analysis: { minFreq: 250, maxFreq: 3000 } },
    capture: { gain: 1, noiseFloor: 0.001, rmsGate: 0.003, dspOff: true },
    melody: { preset: "clean", key: "auto", overrides: { levelGate: 0.003 } },
  });
  expect(fixture.saved?.name).toMatch(/^Recording /);
  expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
    `/recording/${fixture.saved?.id}`,
  );
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

it("stays ready for separate takes and resets the recording clock after saving", async () => {
  await calibratedCapture();
  await click("Record");
  act(() => fixture.metro?.onDownbeat?.());
  advance(4000, true);
  expect(screen.getByRole("group", { name: /Metronome/ }).textContent).toContain("0:03");
  await click("Stop recording");
  const first = fixture.saved;
  expect(first).not.toBeNull();
  expect(screen.queryByText("Editor route")).toBeNull();
  expect(screen.getByRole("status", { name: "Recording saved" })).toBeTruthy();
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(screen.queryByText("0:03")).toBeNull();
  fixture.pcm = new Float32Array(96000).fill(0.2);
  await click("Record");
  expect(screen.queryByRole("status", { name: "Recording saved" })).toBeNull();
  expect(screen.getByRole("group", { name: /Metronome/ }).textContent).toContain("Count-in");
  act(() => fixture.metro?.onDownbeat?.());
  expect(screen.getByRole("group", { name: /Metronome/ }).textContent).toContain("0:00");
  await click("Stop recording");
  expect(fixture.saved?.id).not.toBe(first?.id);
  expect(fixture.saved?.durationSec).toBeCloseTo(1.8);
  expect(screen.getByRole("button", { name: "Record" })).toBeTruthy();
  advance(8000);
  expect(screen.queryByRole("status", { name: "Recording saved" })).toBeNull();
});
it.each(["encode", "recorder"])("allows retry after %s failure", async (kind) => {
  await calibratedCapture();
  fixture.encodeFailure = kind === "encode";
  fixture.recorderFailure = kind === "recorder";
  await click("Record");
  if (kind === "encode") await click("Stop recording");
  expect(screen.getByRole("alert").textContent).toMatch(
    kind === "encode" ? /Save error: storage failed/ : /Record error: worklet unavailable/,
  );
  expect(screen.queryByRole("status", { name: "Recording saved" })).toBeNull();
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});
it("rejects a recording that stops before the downbeat", async () => {
  await calibratedCapture();
  fixture.pcm = new Float32Array(100);
  await click("Record");
  await click("Stop recording");
  expect(screen.getByRole("alert").textContent).toContain("Too short");
  expect(fixture.saved).toBeNull();
  advance(10000);
  expect(screen.queryByRole("alert")).toBeNull();
  expect((screen.getByRole("button", { name: "Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it("replaces the saved toast with an error if the microphone disconnects", async () => {
  await calibratedCapture();
  await click("Record");
  await click("Stop recording");
  expect(screen.getByRole("status", { name: "Recording saved" })).toBeTruthy();
  act(() => fixture.ended?.());
  expect(screen.queryByRole("status", { name: "Recording saved" })).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Microphone disconnected");
});

it.each(["Preview metronome", "Listen for claps"])(
  "shows %s failures as error toasts",
  async (action) => {
    await calibratedCapture();
    await click("Edit Find your tempo");
    fixture.resumePending = Promise.reject(new Error("audio unavailable"));
    await click(action);
    expect(screen.getByRole("alert").textContent).toContain("audio unavailable");
  },
);
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

it.each(["?embed=1&afterRecording=edit", "?afterRecording=edit"])(
  "opens the editor after a configured successful save (%s)",
  async (search) => {
    await calibratedCapture(search);
    await click("Record");
    await click("Stop recording");
    expect(screen.getByText("Editor route")).toBeTruthy();
  },
);
it("keeps capture open when a configured save fails", async () => {
  await calibratedCapture("?embed=1&afterRecording=edit");
  fixture.encodeFailure = true;
  await click("Record");
  await click("Stop recording");
  expect(screen.queryByText("Editor route")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("Save error");
});

it("keeps embedded capture ready when automatic editing is absent", async () => {
  await calibratedCapture("?embed=1");
  await click("Record");
  await click("Stop recording");
  expect(screen.queryByText("Editor route")).toBeNull();
  expect(screen.queryByRole("link", { name: "Library" })).toBeNull();
  expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe(
    `/recording/${fixture.saved?.id}?embed=1`,
  );
});
