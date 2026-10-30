import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MicHandle } from "../../Audio/Audio";
import { useMicrophone } from "./useMicrophone";
const state = vi.hoisted(() => ({
  requests: [] as {
    id: string;
    resolve: (handle: MicHandle) => void;
    reject: (error: Error) => void;
  }[],
}));
vi.mock("../../Audio/Audio", () => ({
  listInputDevices: async () => [],
  openMic: ({ deviceId = "" }: { deviceId?: string }) =>
    new Promise<MicHandle>((resolve, reject) => {
      state.requests.push({ id: deviceId, resolve, reject });
    }),
}));
const errors: string[] = [];
const options = {
  isBusy: () => false,
  onError: (message: string) => errors.push(message),
  onBeforeClose: () => {},
};
function microphone(sampleRate = 48000) {
  return {
    sampleRate,
    context: { resume: async () => {}, currentTime: 1, state: "running" },
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
  errors.length = 0;
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
  vi.unstubAllGlobals();
});
async function release(index: number, mic: MicHandle) {
  await act(async () => {
    state.requests[index]!.resolve(mic);
  });
}
it("requests permission only when opened explicitly and rejects obsolete opens", async () => {
  const { result, unmount } = renderHook(() => useMicrophone(options));
  expect(state.requests).toHaveLength(0);
  act(() => {
    void result.current.openDevice("");
    void result.current.openDevice("new");
  });
  const stale = microphone(44100),
    current = microphone();
  await release(1, current);
  await release(0, stale);
  expect(stale.close).toHaveBeenCalledOnce();
  expect(result.current.deviceId).toBe("new");
  expect(result.current.sampleRate).toBe(48000);
  expect(callbacks.size).toBe(1);
  unmount();
  expect(current.close).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});
it("closes a microphone opening after unmount", async () => {
  const hook = renderHook(() => useMicrophone(options));
  act(() => {
    void hook.result.current.openDevice("");
  });
  hook.unmount();
  const mic = microphone();
  await release(0, mic);
  expect(mic.close).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});
it("ignores obsolete failures and cancelled monitor ticks", async () => {
  const hook = renderHook(() => useMicrophone(options));
  act(() => {
    void hook.result.current.openDevice("");
  });
  const first = microphone();
  await release(0, first);
  const oldTick = [...callbacks.values()][0]!;
  const read = vi.spyOn(first, "readFrame");
  act(() => {
    void hook.result.current.openDevice("second");
    void hook.result.current.openDevice("third");
  });
  await act(async () => state.requests[1]!.reject(new Error("old")));
  expect(errors.at(-1)).toBe("");
  act(() => oldTick(2));
  expect(read).not.toHaveBeenCalled();
  await act(async () => state.requests[2]!.reject(new Error("denied")));
  expect(errors.at(-1)).toBe("Mic error: denied");
});
it("keeps gain consistent with the active microphone and emits observations", async () => {
  const hook = renderHook(() => useMicrophone(options));
  const mic = microphone();
  act(() => {
    void hook.result.current.openDevice("");
  });
  await release(0, mic);
  const observations: number[] = [];
  const off = hook.result.current.subscribe((value) => observations.push(value.t));
  act(() => {
    hook.result.current.changeGain(2);
    const entries = [...callbacks.values()];
    callbacks.clear();
    entries[0]?.(0);
  });
  expect(hook.result.current.gain).toBe(2);
  expect(mic.setGain).toHaveBeenLastCalledWith(2);
  expect(observations).toEqual([1]);
  off();
});
