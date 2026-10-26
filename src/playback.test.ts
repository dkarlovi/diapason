import { afterEach, expect, it, vi } from "vitest";
import { playNotes } from "./playback";

vi.mock("./midiout", () => ({ activeOutput: () => null }));
afterEach(() => vi.unstubAllGlobals());

it("lets a finished note release naturally and fades an interrupted preview", async () => {
  const stops: number[][] = [];
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
    createOscillator: () => {
      const frequency = { value: 0 };
      frequencies.push(frequency);
      const node = {
        frequency,
        connect: (other: unknown) => other,
        start() {},
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
  const { recording } = await import("./test-support/recording");
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
