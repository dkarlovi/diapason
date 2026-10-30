import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMeasurements } from "./useMeasurements";
import type { Observation } from "./useMicrophone";
import { getSoundProfile } from "../../Recording/RecordingProfiles";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("retains a completed room result and cancels obsolete measurements", async () => {
  vi.useFakeTimers();
  let listener: ((value: Observation) => void) | undefined;
  const completed: unknown[] = [];
  const subscribe = (cb: (value: Observation) => void) => {
    listener = cb;
    return () => {
      listener = undefined;
    };
  };
  const { result, unmount } = renderHook(() => useMeasurements(subscribe, () => true));
  act(() => result.current.startRoom((value) => completed.push(value)));
  act(() => {
    for (let i = 0; i < 15; i++)
      listener?.({
        t: i / 10,
        frame: { t: i / 10, freq: null, rms: 0.001, clarity: 0 },
        peak: 0.002,
        samples: new Float32Array(),
      });
    vi.advanceTimersByTime(1500);
  });
  expect(completed).toHaveLength(1);
  expect(completed[0]).toMatchObject({ pass: true, floor: 0.001 });
  act(() => vi.advanceTimersByTime(3000));
  expect(completed).toHaveLength(1);
  act(() =>
    result.current.startSound(0.001, getSoundProfile("whistle"), (value) => completed.push(value)),
  );
  act(() => result.current.cancel());
  act(() => vi.advanceTimersByTime(2000));
  expect(completed).toHaveLength(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
it("fails a measurement with no audio rather than accepting timer completion", () => {
  vi.useFakeTimers();
  const completed: { pass: boolean }[] = [];
  const { result } = renderHook(() =>
    useMeasurements(
      () => () => {},
      () => true,
    ),
  );
  act(() => result.current.startRoom((value) => completed.push(value)));
  act(() => vi.advanceTimersByTime(1500));
  expect(completed[0]?.pass).toBe(false);
});

it("remembers a hidden interval even when no samples arrive during it", () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  let listener: ((value: Observation) => void) | undefined;
  const subscribe = (cb: (value: Observation) => void) => {
    listener = cb;
    return () => {};
  };
  const completed: { pass: boolean }[] = [];
  const { result } = renderHook(() => useMeasurements(subscribe, () => true));
  act(() => result.current.startRoom((value) => completed.push(value)));
  act(() => {
    for (let i = 0; i < 15; i++)
      listener?.({
        t: i / 10,
        frame: { t: i / 10, freq: null, rms: 0.001, clarity: 0 },
        peak: 0.002,
        samples: new Float32Array(),
      });
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(1500);
  });
  expect(completed[0]?.pass).toBe(false);
  hidden.mockRestore();
});
