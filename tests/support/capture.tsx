import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { vi } from "vitest";
import type { Recording } from "../../src/db";
import type { MetronomeOptions } from "../../src/metronome";
const fixture = vi.hoisted(() => ({
  time: 0,
  tone: false,
  frequency: 440,
  denied: false,
  openPending: null as Promise<void> | null,
  openRequests: [] as Array<{ fftSize?: number }>,
  settings: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  } as MediaTrackSettings,
  frames: new Map<number, FrameRequestCallback>(),
  next: 0,
  saved: null as Recording | null,
  encodeFailure: false,
  recorderFailure: false,
  pcm: new Float32Array(48000).fill(0.1),
  resumePending: null as Promise<void> | null,
  recorderPending: null as Promise<import("../../src/recorder").Recorder> | null,
  metro: null as MetronomeOptions | null,
  start: vi.fn(),
  dispose: vi.fn(),
  stopMetro: vi.fn(),
  closeMic: vi.fn(),
  ended: null as (() => void) | null,
}));
vi.mock("../../src/audio", () => ({
  listInputDevices: async () => [{ deviceId: "mic-1", label: "Studio mic", kind: "audioinput" }],
  openMic: async (options: { fftSize?: number }) => {
    fixture.openRequests.push(options);
    if (fixture.openPending) await fixture.openPending;
    if (fixture.denied) throw new Error("permission denied");
    return {
      sampleRate: 48000,
      context: {
        get currentTime() {
          return fixture.time;
        },
        state: "running",
        addEventListener: () => {},
        removeEventListener: () => {},
        resume: () => fixture.resumePending ?? Promise.resolve(),
      },
      tap: {},
      setGain: () => {},
      readFrame: () => new Float32Array([fixture.tone ? 0.1 : 0.002]),
      getSettings: () => fixture.settings,
      onEnded: (listener: () => void) => {
        fixture.ended = listener;
        return () => {
          fixture.ended = null;
        };
      },
      close: fixture.closeMic,
    };
  },
}));
vi.mock("../../src/pitch", () => ({
  createPitchDetector: () => () => ({
    freq: fixture.tone ? fixture.frequency : null,
    clarity: fixture.tone ? 0.99 : 0,
    rms: fixture.tone ? 0.03 : 0.001,
  }),
}));
vi.mock("../../src/trace", async (original) => ({
  ...(await original<typeof import("../../src/trace")>()),
  drawTrace: () => {},
}));
vi.mock("../../src/recorder", async (original) => ({
  ...(await original<typeof import("../../src/recorder")>()),
  createRecorder: async () => {
    if (fixture.recorderFailure) throw new Error("worklet unavailable");
    if (fixture.recorderPending) return fixture.recorderPending;
    return { start: fixture.start, stop: () => fixture.pcm, dispose: fixture.dispose };
  },
}));
vi.mock("../../src/metronome", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/metronome")>()),
  startMetronome: (_ctx: unknown, options: MetronomeOptions) => {
    fixture.metro = options;
    return { downbeatTime: fixture.time + 0.2, stop: fixture.stopMetro };
  },
}));
vi.mock("../../src/codec", () => ({
  encodeAudio: async () => {
    if (fixture.encodeFailure) throw new Error("storage failed");
    return new Blob(["audio"]);
  },
}));
vi.mock("../../src/db", () => ({
  putRecording: async (record: Recording) => {
    fixture.saved = record;
  },
}));
import { Capture } from "../../src/components/Capture";
export function resetFixture() {
  vi.useFakeTimers();
  fixture.time = 0;
  fixture.tone = false;
  fixture.frequency = 440;
  fixture.denied = false;
  fixture.openPending = null;
  fixture.openRequests = [];
  fixture.settings = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  fixture.saved = null;
  fixture.encodeFailure = false;
  fixture.recorderFailure = false;
  fixture.pcm = new Float32Array(48000).fill(0.1);
  fixture.resumePending = null;
  fixture.recorderPending = null;
  fixture.metro = null;
  fixture.start.mockClear();
  fixture.dispose.mockClear();
  fixture.stopMetro.mockClear();
  fixture.closeMic.mockClear();
  fixture.frames.clear();
  fixture.next = 0;
  fixture.ended = null;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    fixture.frames.set(++fixture.next, cb);
    return fixture.next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => fixture.frames.delete(id));
}
export function renderCapture(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/${search}`]}>
      <Routes>
        <Route path="/" element={<Capture />} />
        <Route path="/recording/:id" element={<div>Editor route</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
export async function click(name: string | RegExp) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}
export function advance(ms: number, tone = false) {
  fixture.tone = tone;
  act(() => {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      fixture.time += 0.05;
      const callbacks = [...fixture.frames.values()];
      fixture.frames.clear();
      for (const cb of callbacks) cb(fixture.time * 1000);
      vi.advanceTimersByTime(50);
    }
  });
}
export async function microphoneReady() {
  await click("Continue with whistling");
  await click("Confirm microphone");
}
export async function calibratedCapture(search = "") {
  const view = renderCapture(search);
  await microphoneReady();
  await click("Measure room noise");
  advance(1500);
  await click("Check my sound");
  advance(2000, true);
  fireEvent.change(screen.getByLabelText("Tempo (BPM)"), { target: { value: "90" } });
  await click("Confirm tempo");
  return view;
}

export { fixture };
