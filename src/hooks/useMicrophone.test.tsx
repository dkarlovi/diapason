import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MicHandle } from "../audio";
import { useCapture } from "./useCapture";
const state = vi.hoisted(() => ({
  requests: [] as {
    id: string;
    resolve: (handle: MicHandle) => void;
    reject: (error: Error) => void;
  }[],
}));
vi.mock("../audio", () => ({
  listInputDevices: async () => [],
  openMic: ({ deviceId = "" }: { deviceId?: string } = {}) =>
    new Promise<MicHandle>((resolve, reject) => {
      state.requests.push({ id: deviceId, resolve, reject });
    }),
}));
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}
function microphone(sampleRate = 48000) {
  return {
    sampleRate,
    context: { resume: async () => {}, currentTime: 1 },
    source: {},
    tap: {},
    readFrame: () => new Float32Array(32),
    setGain: vi.fn(),
    getSettings: () => ({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }),
    close: vi.fn(),
  } as unknown as MicHandle;
}
let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  state.requests = [];
  callbacks = new Map();
  nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function release(index: number, mic: MicHandle) {
  await act(async () => {
    state.requests[index]!.resolve(mic);
  });
}
it("discards out-of-order opens and runs only the newest monitor", async () => {
  const { result, unmount } = renderHook(() => useCapture(), { wrapper });
  act(() => {
    void result.current.openDevice("new");
  });
  const stale = microphone(44100),
    current = microphone();
  await release(1, current);
  await release(0, stale);
  expect(stale.close).toHaveBeenCalledOnce();
  expect(current.close).not.toHaveBeenCalled();
  expect(result.current.sampleRate).toBe(48000);
  expect(result.current.deviceId).toBe("new");
  expect(callbacks.size).toBe(1);
  unmount();
  expect(current.close).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});
it("closes a microphone that opens after unmount without starting its monitor", async () => {
  const hook = renderHook(() => useCapture(), { wrapper });
  hook.unmount();
  const mic = microphone();
  await release(0, mic);
  expect(mic.close).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});
it("resets calibration on device change and cancels the old room timer", async () => {
  const { result } = renderHook(() => useCapture(), { wrapper });
  const first = microphone();
  await release(0, first);
  vi.useFakeTimers();
  act(() => result.current.measureRoom());
  act(() => {
    void result.current.openDevice("second");
  });
  act(() => vi.advanceTimersByTime(1500));
  expect(result.current.noiseMeasured).toBe(false);
  expect(result.current.noiseReadout).toBe("not measured yet");
  expect(first.close).toHaveBeenCalledOnce();
  await release(1, microphone());
  act(() => result.current.measureRoom());
  act(() => vi.advanceTimersByTime(1500));
  expect(result.current.noiseMeasured).toBe(true);
  act(() => {
    void result.current.openDevice("third");
  });
  expect(result.current.noiseMeasured).toBe(false);
});
it("cancels calibration on unmount and applies gain to the active device", async () => {
  const hook = renderHook(() => useCapture(), { wrapper });
  const mic = microphone();
  await release(0, mic);
  vi.useFakeTimers();
  act(() => hook.result.current.changeGain(2));
  expect(mic.setGain).toHaveBeenLastCalledWith(2);
  act(() => hook.result.current.measureRoom());
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
  expect(callbacks.size).toBe(0);
  expect(mic.close).toHaveBeenCalledOnce();
});
it("surfaces current microphone errors and ignores obsolete failures", async () => {
  const { result } = renderHook(() => useCapture(), { wrapper });
  act(() => {
    void result.current.openDevice("new");
  });
  await act(async () => {
    state.requests[0]!.reject(new Error("old"));
  });
  expect(result.current.status).toBe("");
  await act(async () => {
    state.requests[1]!.reject(new Error("denied"));
  });
  expect(result.current.status).toBe("Mic error: denied");
});

it("survives StrictMode replay with one live monitor and closes the obsolete open", async () => {
  const hook = renderHook(() => useCapture(), { wrapper, reactStrictMode: true });
  expect(state.requests).toHaveLength(2);
  const obsolete = microphone(44100),
    current = microphone();
  await release(1, current);
  await release(0, obsolete);
  expect(obsolete.close).toHaveBeenCalledOnce();
  expect(current.close).not.toHaveBeenCalled();
  expect(hook.result.current.sampleRate).toBe(48000);
  expect(callbacks.size).toBe(1);
  hook.unmount();
  expect(current.close).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});

it("ignores a cancelled monitor callback after switching devices", async () => {
  const hook = renderHook(() => useCapture(), { wrapper });
  const first = microphone(),
    second = microphone();
  const readFirst = vi.spyOn(first, "readFrame"),
    readSecond = vi.spyOn(second, "readFrame");
  await release(0, first);
  const obsoleteTick = [...callbacks.values()][0]!;
  await act(async () => {
    void hook.result.current.openDevice("next");
  });
  await release(1, second);
  act(() => obsoleteTick(1));
  expect(readFirst).toHaveBeenCalledOnce();
  expect(readSecond).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(1);
});
