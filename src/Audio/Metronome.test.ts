import { afterEach, expect, it, vi } from "vitest";
import { startMetronome } from "./Metronome";
afterEach(() => vi.useRealTimers());

it.each([
  { bpm: 60, beatsPerBar: 5, offsets: [0, 1, 2, 2.5, 3, 4, 4.5, 5] },
  { bpm: 119, beatsPerBar: 4, offsets: [0, 1, 2, 2.5, 3, 4] },
  { bpm: 120, beatsPerBar: 5, offsets: [0, 1, 2, 3, 4, 5] },
  { bpm: 121, beatsPerBar: 3, offsets: [0, 1, 2, 3] },
  { bpm: 60, beatsPerBar: 1, offsets: [0, 1] },
  { bpm: 60, beatsPerBar: 2, offsets: [0, 1, 2] },
])(
  "schedules half-beat cues at $bpm BPM in $beatsPerBar-beat bars",
  ({ bpm, beatsPerBar, offsets }) => {
    vi.useFakeTimers();
    let time = 0;
    const clicks: { at: number; frequency: number; level: number }[] = [];
    const stops: number[] = [];
    let level = 0;
    const ctx = {
      get currentTime() {
        return time;
      },
      destination: {},
      createOscillator: () => {
        const osc = {
          frequency: { value: 0 },
          connect: () => ({ connect: () => {} }),
          start: (at: number) => clicks.push({ at, frequency: osc.frequency.value, level }),
          stop: (at: number) => stops.push(at),
          disconnect: () => {},
        };
        return osc;
      },
      createGain: () => ({
        gain: {
          setValueAtTime: () => {
            level = 0;
          },
          exponentialRampToValueAtTime: (value: number) => {
            level = Math.max(level, value);
          },
        },
        disconnect: () => {},
      }),
    } as unknown as AudioContext;
    const onBeat = vi.fn();
    const onDownbeat = vi.fn();
    const handle = startMetronome(ctx, { bpm, beatsPerBar, onBeat, onDownbeat });
    const duration = 60 / bpm;
    // Traverse both count-in and recording, including the following downbeat.
    const end = 0.15 + 2 * beatsPerBar * duration;
    for (time = 0; time < end; time += 0.025) vi.advanceTimersByTime(25);
    time = end + 0.001;
    vi.advanceTimersByTime(25);
    const expected = [...offsets.slice(0, -1), ...offsets.map((offset) => offset + beatsPerBar)];
    expect(clicks).toHaveLength(expected.length);
    clicks.forEach((click, index) => {
      const offset = expected[index]!;
      expect(click.at).toBeCloseTo(0.15 + offset * duration);
      if (offset % 1 !== 0) {
        expect(click.frequency).toBe(1000);
        expect(click.level).toBeLessThan(0.3);
      } else {
        expect(click.frequency).toBe(offset % beatsPerBar === 0 ? 1600 : 1000);
      }
    });
    expect(onBeat.mock.calls.map(([index]) => index)).toEqual(
      Array.from({ length: 2 * beatsPerBar + 1 }, (_, index) => index - beatsPerBar),
    );
    expect(onDownbeat).toHaveBeenCalledOnce();
    handle.stop();
    expect(stops).toContain(time);
    const count = clicks.length;
    time += 10;
    vi.advanceTimersByTime(1000);
    expect(clicks).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  },
);
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
