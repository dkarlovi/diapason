// @vitest-environment node
import { expect, it } from "vitest";
import { contourFrames } from "./contours";

it("keeps frame times continuous across pitch regions and silence", () => {
  const frames = contourFrames([
    { kind: "hold", frames: 2, midi: 69 },
    { kind: "silence", frames: 1 },
    { kind: "hold", frames: 1, midi: 81, rms: 0.03 },
  ]);
  expect(frames).toEqual([
    { t: 0, freq: 440, clarity: 0.99, rms: 0.1 },
    { t: 512 / 48000, freq: 440, clarity: 0.99, rms: 0.1 },
    { t: 1024 / 48000, freq: null, clarity: 0, rms: 0 },
    { t: 1536 / 48000, freq: 880, clarity: 0.99, rms: 0.03 },
  ]);
});

it("includes both endpoints of upward and downward linear motion", () => {
  const frames = contourFrames([
    { kind: "linear", frames: 3, from: 69, to: 93 },
    { kind: "linear", frames: 3, from: 93, to: 69 },
  ]);
  expect(frames.map((frame) => frame.freq)).toEqual([440, 880, 1760, 1760, 880, 440]);
});

it("starts a one-frame ramp at its initial pitch without NaN", () => {
  expect(contourFrames([{ kind: "linear", frames: 1, from: 69, to: 81 }])[0]!.freq).toBe(440);
});

it("uses absolute source time for vibrato phase", () => {
  const frames = contourFrames([
    { kind: "hold", frames: 1, midi: 69 },
    { kind: "vibrato", frames: 4, midi: 69, amplitude: 12, hz: 23.4375 },
  ]);
  for (const [index, expected] of [880, 440, 220, 440].entries())
    expect(frames[index + 1]!.freq).toBeCloseTo(expected, 9);
});
