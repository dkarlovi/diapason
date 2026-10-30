import { afterEach, expect, it, vi } from "vitest";
import type { InstrumentId } from "./instruments";

vi.mock("./midiout", () => ({ activeOutput: () => null }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A fresh playback module (it caches its AudioContext) wired to a recording fake context. */
async function fakeAudio() {
  vi.resetModules();
  const stops: number[][] = [];
  const starts: number[] = [];
  const ramps: number[][] = [];
  const frequencies: { value: number }[] = [];
  const audio = {
    currentTime: 0,
    state: "running",
    destination: {},
    createGain: () => {
      const node = {
        connect: () => node,
        gain: {
          value: 0,
          setValueAtTime() {},
          linearRampToValueAtTime: (...args: number[]) => ramps.push(args),
          setTargetAtTime() {},
          cancelScheduledValues() {},
        },
      };
      return node;
    },
    createPeriodicWave: (real: Float32Array, imaginary: Float32Array) => ({ real, imaginary }),
    createBiquadFilter: () => {
      const node = {
        frequency: { setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} },
        Q: { value: 0 },
        connect: (other: unknown) => other,
      };
      return node;
    },
    createOscillator: () => {
      const frequency = { value: 0 };
      frequencies.push(frequency);
      const node = {
        frequency,
        setPeriodicWave() {},
        connect: (other: unknown) => other,
        start: (at: number) => starts.push(at),
        stop: (...args: number[]) => stops.push(args),
      };
      return node;
    },
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return audio;
      }
    },
  );
  const { playNotes } = await import("./playback");
  return { audio, stops, starts, ramps, frequencies, playNotes };
}

it("lets a finished note release naturally and fades an interrupted preview", async () => {
  const { audio, stops, ramps, frequencies, playNotes } = await fakeAudio();
  const note = { start: 0, duration: 0.5, midi: 69, name: "A4" };
  const finished = playNotes([note], 0.5);
  audio.currentTime = 0.551;
  expect(finished.position()).toBeNull();
  finished.stop();
  // The voice's scheduled release must survive transport cleanup.
  expect(stops).toHaveLength(1);
  expect(stops[0]![0]).toBeCloseTo(0.58);
  const interrupted = playNotes([note], 0.5);
  audio.currentTime += 0.2;
  interrupted.stop();
  expect(ramps.at(-1)?.[0]).toBe(0);
  expect(ramps.at(-1)?.[1]).toBeGreaterThan(audio.currentTime);
  expect(stops.at(-1)?.[0]).toBeGreaterThan(audio.currentTime);
  const { processRecording } = await import("./recording");
  const { recording } = await import("../tests/support/recording");
  const rec = recording({
    noteEdits: { version: 1, pitch: [{ id: "manual", midi: 73, ranges: [{ start: 0, end: 1 }] }] },
  });
  const notes = processRecording(
    rec,
    Array.from({ length: 100 }, (_, i) => ({ t: i * 0.01, freq: 440, clarity: 0.99, rms: 0.1 })),
  ).notes;
  playNotes(notes, 1, { instrument: "beep", octave: 1 });
  expect(frequencies.at(-1)?.value).toBeCloseTo(440 * 2 ** ((85 - 69) / 12));
  expect(notes[0]?.midi).toBe(73);
  expect(rec.noteEdits?.pitch[0]?.midi).toBe(73);
});

it("schedules notes a window ahead of the audio clock and stops refilling on stop", async () => {
  vi.useFakeTimers();
  const { audio, starts, playNotes } = await fakeAudio();
  audio.currentTime = 10;
  const notes = [0, 1, 1.94, 1.95, 3, 5].map((start) => ({
    start,
    duration: 0.25,
    midi: 69,
    name: "A4",
  }));
  const playback = playNotes([...notes].reverse(), 6);
  expect(starts).toEqual([10.05, 11.05, 11.99]);
  audio.currentTime = 11.1;
  vi.advanceTimersByTime(250);
  expect(starts.slice(3)).toEqual([12, 13.05]);
  expect(playback.position()).toBeCloseTo(1.05);
  playback.stop();
  audio.currentTime = 14;
  vi.advanceTimersByTime(1000);
  expect(starts).toHaveLength(5);
});
it("stops refilling once every note is scheduled", async () => {
  vi.useFakeTimers();
  const { audio, starts, playNotes } = await fakeAudio();
  playNotes([{ start: 2.5, duration: 0.25, midi: 69, name: "A4" }], 3);
  expect(starts).toEqual([]);
  audio.currentTime = 1;
  vi.advanceTimersByTime(250);
  expect(starts).toEqual([2.55]);
  expect(vi.getTimerCount()).toBe(0);
});

it.each<InstrumentId>(["trumpet", "saxophone"])(
  "plays %s at the selected octave with a sustained voice and cancellable release",
  async (instrument) => {
    const { audio, starts, stops, frequencies, ramps, playNotes } = await fakeAudio();
    const note = { start: 0, duration: 0.5, midi: 67, name: "G4" };
    const playback = playNotes([note], 0.5, { instrument, octave: -1 });
    expect(frequencies[0]?.value).toBeCloseTo(196, 0);
    expect(starts).toEqual([0.05, 0.05]);
    expect(stops.every(([end]) => end! > 0.65)).toBe(true);
    audio.currentTime = 0.3;
    playback.stop();
    expect(ramps.at(-1)?.[0]).toBe(0);
    expect(stops.slice(-2).map(([at]) => at)).toEqual([0.315, 0.315]);
    expect(note.midi).toBe(67);
  },
);
