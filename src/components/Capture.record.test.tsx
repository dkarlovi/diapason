import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import type { Recording } from "../db";
import type { MetronomeOptions } from "../metronome";
import { Capture } from "./Capture";

const dispose = vi.fn();
const stopMetro = vi.fn();
const closeMic = vi.fn();
let recorderPending: Promise<import("../recorder").Recorder> | null = null;
let samples = new Float32Array([0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
let metroCallbacks: MetronomeOptions | null = null;
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
    close: closeMic,
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
      if (recorderPending) return recorderPending;
      return {
        start,
        stop: () => samples,
        dispose,
      };
    },
  };
});
vi.mock("../metronome", () => ({
  startMetronome: (_ctx: unknown, options: MetronomeOptions) => {
    metroCallbacks = options;
    return { downbeatTime: 1.2, stop: stopMetro };
  },
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
  dispose.mockClear();
  stopMetro.mockClear();
  closeMic.mockClear();
  recorderPending = null;
  metroCallbacks = null;
  samples = new Float32Array([0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
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

async function calibratedCapture() {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  const view = render(
    <MemoryRouter>
      <Capture />
    </MemoryRouter>,
  );
  await screen.findByText("10 Hz");
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /Record the room/ }));
  act(() => vi.advanceTimersByTime(1500));
  return view;
}
it("does not start recording after unmount during context resume", async () => {
  const view = await calibratedCapture();
  let release!: () => void;
  resumePending = new Promise<void>((resolve) => {
    release = resolve;
  });
  fireEvent.click(screen.getByRole("button", { name: "● Record" }));
  view.unmount();
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(start).not.toHaveBeenCalled();
  expect(closeMic).toHaveBeenCalledOnce();
});
it("disposes a recorder created after unmount", async () => {
  const view = await calibratedCapture();
  let release!: (recorder: import("../recorder").Recorder) => void;
  recorderPending = new Promise((resolve) => {
    release = resolve;
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "● Record" }));
    await Promise.resolve();
  });
  view.unmount();
  await act(async () => {
    release({ start, stop: () => samples, dispose });
    await Promise.resolve();
  });
  expect(start).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
});
it("rejects a recording shorter than 300 ms after trimming count-in", async () => {
  await calibratedCapture();
  samples = new Float32Array([0, 0, 0.5, 0.5]);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "● Record" }));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Stop & save/ }));
  });
  expect(screen.getByText(/Too short/)).toBeTruthy();
  expect(saved).toBeNull();
  expect(stopMetro).toHaveBeenCalledOnce();
});
it.each(["count-in", "recording"])(
  "releases recorder and metronome before closing the microphone during %s",
  async (phase) => {
    const view = await calibratedCapture();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "● Record" }));
    });
    if (phase === "recording") {
      act(() => metroCallbacks?.onDownbeat?.());
      expect(screen.getByText(/Recording… hit Stop/)).toBeTruthy();
    }
    view.unmount();
    expect(dispose).toHaveBeenCalledOnce();
    expect(stopMetro).toHaveBeenCalledOnce();
    expect(closeMic).toHaveBeenCalledOnce();
    expect(dispose.mock.invocationCallOrder[0]).toBeLessThan(closeMic.mock.invocationCallOrder[0]!);
    expect(stopMetro.mock.invocationCallOrder[0]).toBeLessThan(
      closeMic.mock.invocationCallOrder[0]!,
    );
  },
);

it("blocks device switching during startup and recording, then releases the old recorder", async () => {
  const { renderHook } = await import("@testing-library/react");
  const { useCapture } = await import("../hooks/useCapture");
  const hook = renderHook(() => useCapture(), { wrapper: MemoryRouter });
  await act(async () => {
    await Promise.resolve();
  });
  vi.useFakeTimers();
  act(() => hook.result.current.measureRoom());
  act(() => vi.advanceTimersByTime(1500));
  let release!: () => void;
  resumePending = new Promise<void>((resolve) => {
    release = resolve;
  });
  act(() => {
    void hook.result.current.startRecording();
  });
  await act(async () => {
    await hook.result.current.openDevice("blocked-start");
  });
  expect(hook.result.current.deviceId).toBe("");
  await act(async () => {
    release();
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    await hook.result.current.openDevice("blocked-record");
  });
  expect(hook.result.current.deviceId).toBe("");
  expect(hook.result.current.recording).toBe(true);
  samples = new Float32Array([0, 0, 0.5]);
  await act(async () => {
    await hook.result.current.stopRecording();
  });
  await act(async () => {
    await hook.result.current.openDevice("next");
  });
  expect(hook.result.current.deviceId).toBe("next");
  expect(hook.result.current.noiseMeasured).toBe(false);
  expect(dispose).toHaveBeenCalledOnce();
  expect(closeMic).toHaveBeenCalledOnce();
});
