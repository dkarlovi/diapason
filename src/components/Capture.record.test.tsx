import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { Recording } from "../db";
import { Capture } from "./Capture";

let saved: Recording | null = null;
let encodeFailure = false;
let recorderFailure = false;
let resumePending: Promise<void> | null = null;
const start = vi.fn();
vi.mock("../audio", () => ({
  listInputDevices: async () => [],
  openMic: async () => ({
    sampleRate: 10,
    context: { currentTime: 1, resume: () => resumePending ?? Promise.resolve() },
    tap: {},
    setGain: () => undefined,
    readFrame: () => new Float32Array([0.1]),
    getSettings: () => ({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }),
    close: () => undefined,
  }),
}));
vi.mock("../pitch", () => ({
  createPitchDetector: () => () => ({ freq: 440, clarity: 0.99, rms: 0.004 }),
}));
vi.mock("../trace", async (importOriginal) => {
  const original = await importOriginal<typeof import("../trace")>();
  return { ...original, drawTrace: () => undefined };
});
vi.mock("../recorder", async (importOriginal) => {
  const original = await importOriginal<typeof import("../recorder")>();
  return {
    ...original,
    createRecorder: async () => {
      if (recorderFailure) throw new Error("worklet unavailable");
      return {
        start,
        stop: () => new Float32Array([0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
        dispose: () => undefined,
      };
    },
  };
});
vi.mock("../metronome", () => ({
  startMetronome: () => ({ downbeatTime: 1.2, stop: () => undefined }),
}));
vi.mock("../codec", () => ({
  encodeAudio: async () => {
    if (encodeFailure) throw new Error("storage failed");
    return new Blob(["audio"]);
  },
}));
vi.mock("../db", () => ({
  putRecording: async (record: Recording) => {
    saved = record;
  },
}));
vi.mock("../router", () => ({ takePath: (id: string) => `/take/${id}` }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  saved = null;
  encodeFailure = false;
  recorderFailure = false;
  resumePending = null;
  start.mockClear();
});

it("disables record while the audio context is starting", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  expect(await screen.findByText("10 Hz")).toBeTruthy();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  act(() => vi.advanceTimersByTime(1500));
  let release!: () => void;
  resumePending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const button = screen.getByRole("button", { name: "● Record" }) as HTMLButtonElement;
  fireEvent.click(button);
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(start).toHaveBeenCalledOnce();
});

it("saves audio after count in with the calibrated capture settings", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  expect(await screen.findByText("10 Hz")).toBeTruthy();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  act(() => vi.advanceTimersByTime(1500));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "● Record" }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(start).toHaveBeenCalledOnce();
  expect((screen.getByRole("button", { name: /Stop & save/ }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Stop & save/ }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(saved).toMatchObject({
    sampleRate: 10,
    durationSec: 0.8,
    bpm: 90,
    beatsPerBar: 4,
    capture: { gain: 1, peak: 0.5, noiseFloor: 0.003, dspOff: true },
  });
});

it("shows a save error and allows retrying when encoding fails", async () => {
  encodeFailure = true;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  expect(await screen.findByText("10 Hz")).toBeTruthy();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  act(() => vi.advanceTimersByTime(1500));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "● Record" }));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Stop & save/ }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByText(/Save error: storage failed/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "● Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
});

it("shows a recorder error without entering recording state", async () => {
  recorderFailure = true;
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  expect(await screen.findByText("10 Hz")).toBeTruthy();
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  act(() => vi.advanceTimersByTime(1500));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "● Record" }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.getByText(/Record error: worklet unavailable/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "● Record" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(start).not.toHaveBeenCalled();
});
