// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../../tests/support/investigation";
import { tunePlaybackEvents } from "./Events";
import { readTuneMidiMusic } from "../Midi/TuneMidiReader";
import { encodeTuneMidi } from "../Midi/TuneMidi";
it("uses exported instrument/octave and independently reads actual MIDI events", async () => {
  const { context } = await investigationContext();
  const p = context.input.metadata;
  if (p.schemaVersion !== 2) throw new Error("fixture");
  const tune = { ...p.tune, play: { instrument: "flute" as const, octave: -1 as const } };
  const playback = tunePlaybackEvents(tune);
  expect(playback.notes[0]!.midi).toBe(p.evidence.notes[0]!.midi - 12);
  expect(playback.instrument).toBe("flute");
  const bytes = new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer());
  const read = readTuneMidiMusic(bytes);
  expect(read.events).toEqual(playback.events);
  expect(read.program).toBe(73);
  expect(read.beatsPerBar).toBe(4);
  expect(read.microsecondsPerQuarter).toBe(Math.round(60000000 / 95));
});

it("normalizes stepped playback pitches before octave filtering", async () => {
  const { logicalPlaybackEvents } = await import("./Events");
  const result = logicalPlaybackEvents(
    [
      {
        midi: 69,
        name: "A4",
        start: 0,
        duration: 1,
        bend: {
          glide: 0.4,
          points: [
            { position: 0, offset: -2 },
            { position: 1, offset: 0 },
          ],
        },
      },
    ],
    { play: { instrument: "beep", octave: -1 }, bpm: 120, beatsPerBar: 4 },
  );
  expect(result.notes.map((n) => n.midi)).toEqual([55, 56, 57]);
  expect(result.events.every((e) => e.type === "on" || e.type === "off")).toBe(true);
});
