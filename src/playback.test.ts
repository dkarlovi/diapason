import { afterEach, expect, it, vi } from "vitest";
import { playNotes } from "./playback";

vi.mock("./midiout", () => ({ activeOutput: () => null }));
afterEach(() => vi.unstubAllGlobals());

it("lets a finished note release naturally and fades an interrupted preview", () => {
  const stops: number[][] = [];
  const ramps: number[][] = [];
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
      const node = {
        frequency: { value: 0 },
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
});
