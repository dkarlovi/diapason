// @vitest-environment node
import { expect, it } from "vitest";
import { notesToMidi } from "./midi";
import { readMidiEvents } from "../tests/support/midi-files";

it("rejects sub-tick note collisions instead of inventing an overlap", () => {
  expect(() =>
    notesToMidi(
      [
        { midi: 60, name: "C4", start: 0, duration: 0.0001 },
        { midi: 62, name: "D4", start: 0.0001, duration: 0.0001 },
      ],
      { bpm: 120 },
    ),
  ).toThrow(/resolution/i);
});

it("emits note-off before note-on at a shared boundary", async () => {
  const blob = notesToMidi(
    [
      { midi: 60, name: "C4", start: 0, duration: 0.5 },
      { midi: 60, name: "C4", start: 0.5, duration: 0.5 },
    ],
    { bpm: 120 },
  );
  expect(readMidiEvents(new Uint8Array(await blob.arrayBuffer()))).toEqual([
    { tick: 0, status: 144, midi: 60, velocity: 96 },
    { tick: 480, status: 128, midi: 60, velocity: 0 },
    { tick: 480, status: 144, midi: 60, velocity: 96 },
    { tick: 960, status: 128, midi: 60, velocity: 0 },
  ]);
});
