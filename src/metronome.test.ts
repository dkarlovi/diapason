import { afterEach, expect, it, vi } from "vitest";
import { startMetronome } from "./metronome";
afterEach(() => vi.useRealTimers());
it("cancels already scheduled preview clicks before clap listening starts", () => {
  vi.useFakeTimers();
  const stops: number[] = [];
  let time = 0;
  const osc = {
    frequency: { value: 0 },
    connect: () => ({ connect: () => {} }),
    start: () => {},
    stop: (at: number) => stops.push(at),
    disconnect: vi.fn(),
    onended: null,
  };
  const ctx = {
    get currentTime() {
      return time;
    },
    destination: {},
    createOscillator: () => osc,
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      disconnect: () => {},
    }),
  } as unknown as AudioContext;
  const metronome = startMetronome(ctx, { bpm: 120, beatsPerBar: 4, countInBars: 0 });
  time = 0.05;
  vi.advanceTimersByTime(50);
  expect(stops).toContain(0.19);
  metronome.stop();
  expect(stops).toContain(0.05);
  expect(osc.disconnect).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("waits for the audio clock downbeat when a context pauses during count-in", () => {
  vi.useFakeTimers();
  let time = 0;
  const downbeat = vi.fn();
  const ctx = {
    get currentTime() {
      return time;
    },
    destination: {},
    createOscillator: () => ({
      frequency: { value: 0 },
      connect: () => ({ connect: () => {} }),
      start: () => {},
      stop: () => {},
      disconnect: () => {},
    }),
    createGain: () => ({
      gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      disconnect: () => {},
    }),
  } as unknown as AudioContext;
  const metronome = startMetronome(ctx, { bpm: 120, beatsPerBar: 4, onDownbeat: downbeat });
  vi.advanceTimersByTime(4000);
  expect(downbeat).not.toHaveBeenCalled();
  time = 2.15;
  vi.advanceTimersByTime(25);
  expect(downbeat).toHaveBeenCalledOnce();
  metronome.stop();
});
