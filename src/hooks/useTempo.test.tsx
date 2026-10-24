import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useTempo } from "./useTempo";
import type { MicHandle } from "../audio";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("estimates tapped tempo, requires stable detection, and supports manual override", () => {
  vi.useFakeTimers();
  const changes: number[] = [];
  const { result } = renderHook(() =>
    useTempo({
      bpm: 90,
      beatsPerBar: 4,
      floor: 0.001,
      currentMic: () => null,
      onChange: (bpm) => changes.push(bpm),
      onError: () => {},
      onConfirm: () => {},
    }),
  );
  act(() => result.current.tap());
  expect(result.current.canConfirm).toBe(false);
  for (let i = 0; i < 4; i++)
    act(() => {
      vi.advanceTimersByTime(500);
      result.current.tap();
    });
  expect(result.current.estimate).toMatchObject({ bpm: 120, stable: true });
  expect(changes.at(-1)).toBe(120);
  act(() => result.current.changeBpm(100));
  expect(result.current.canConfirm).toBe(true);
  expect(changes.at(-1)).toBe(100);
});
it("disposes a clap subscription that finishes after cancellation", async () => {
  let release!: (off: () => void) => void;
  const off = vi.fn();
  const mic = {
    sampleRate: 48000,
    context: { state: "running", resume: async () => {} },
    subscribePcm: () =>
      new Promise<() => void>((resolve) => {
        release = resolve;
      }),
  } as unknown as MicHandle;
  const { result } = renderHook(() =>
    useTempo({
      bpm: 90,
      beatsPerBar: 4,
      floor: 0.001,
      currentMic: () => mic,
      onChange: () => {},
      onError: () => {},
      onConfirm: () => {},
    }),
  );
  await act(async () => {
    void result.current.startClap();
  });
  act(() => result.current.stop());
  await act(async () => {
    release(off);
  });
  expect(off).toHaveBeenCalledOnce();
  expect(result.current.listening).toBe(false);
});

it("previews confirmed numeric settings and releases the transport on stop", async () => {
  const stopMetro = vi.fn();
  const startMetronome = vi
    .spyOn(await import("../metronome"), "startMetronome")
    .mockImplementation(() => ({ downbeatTime: 2, stop: stopMetro }));
  const mic = { context: { state: "running", resume: async () => {} } } as unknown as MicHandle;
  const { result } = renderHook(() =>
    useTempo({
      bpm: 120,
      beatsPerBar: 3,
      floor: 0.001,
      currentMic: () => mic,
      onChange: () => {},
      onError: () => {},
      onConfirm: () => {},
    }),
  );
  await act(async () => {
    await result.current.preview();
  });
  expect(result.current.transport).toMatchObject({
    bpm: 120,
    beatsPerBar: 3,
    downbeatTime: 2,
    phase: "preview",
  });
  expect(startMetronome).toHaveBeenCalledWith(mic.context, {
    bpm: 120,
    beatsPerBar: 3,
    countInBars: 0,
  });
  act(() => result.current.stop());
  expect(result.current.transport).toBeNull();
  expect(stopMetro).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
