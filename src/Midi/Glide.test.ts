import { expect, it } from "vitest";
import { midiEvents, notesToMidi } from "./Midi";
import type { NoteEvent } from "../Melody/Notes";
const curved: NoteEvent = {
  midi: 69,
  name: "A4",
  start: 0,
  duration: 1,
  bend: {
    glide: 1,
    points: [
      { position: 0, offset: -12 },
      { position: 1, offset: 0 },
    ],
  },
};
it("advertises bend range, initializes pitch before note-on and resets after note-off", () => {
  const events = midiEvents([curved, { midi: 70, name: "Bb4", start: 1, duration: 1 }]);
  expect(events.slice(0, 6)).toEqual(
    [101, 100, 6, 38, 101, 100].map((controller, i) => ({
      tick: 0,
      type: "control",
      controller,
      value: [0, 0, 12, 0, 127, 127][i],
    })),
  );
  expect(events[6]).toEqual({ tick: 0, type: "bend", value: 0 });
  expect(events[7]).toEqual({ tick: 0, type: "on", midi: 69 });
  expect(events.filter((e) => e.tick === 960).map((e) => e.type)).toEqual(["off", "bend", "on"]);
});
it("expands semitone steps into articulated ordinary MIDI notes", async () => {
  const events = midiEvents([{ ...curved, bend: { ...curved.bend!, glide: 0.4 } }]);
  expect(events.every((e) => e.type === "on" || e.type === "off")).toBe(true);
  expect(events.filter((e) => e.type === "on")).toHaveLength(13);
  expect((await notesToMidi([curved]).arrayBuffer()).byteLength).toBeGreaterThan(100);
});

it("keeps flat legacy MIDI bytes and event object fields identical", async () => {
  const flat = { midi: 69, name: "A4", start: 0, duration: 1 };
  expect(midiEvents([flat])).toEqual([
    { tick: 0, type: "on", midi: 69 },
    { tick: 960, type: "off", midi: 69 },
  ]);
  expect(Array.from(new Uint8Array(await notesToMidi([flat]).arrayBuffer()))).toEqual([
    77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107, 0, 0, 0, 20, 0, 255, 81, 3,
    7, 161, 32, 0, 144, 69, 96, 135, 64, 128, 69, 0, 0, 255, 47, 0,
  ]);
});

it("configures the full 48-semitone range and clamps 14-bit positive bends", () => {
  const events = midiEvents([
    {
      ...curved,
      bend: {
        glide: 1,
        points: [
          { position: 0, offset: 48 },
          { position: 1, offset: 0 },
        ],
      },
    },
  ]);
  expect(events[2]).toEqual({ tick: 0, type: "control", controller: 6, value: 48 });
  expect(events[6]).toEqual({ tick: 0, type: "bend", value: 16383 });
  expect(events.at(-1)).toEqual({ tick: 960, type: "bend", value: 8192 });
});
