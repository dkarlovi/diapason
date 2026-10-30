// @vitest-environment node
import { expect, it } from "vitest";
import { investigationContext } from "../test-support/investigation";
import { tunePlaybackEvents } from "./events";
import { readTuneMidiMusic } from "../tune-midi-reader";
import { encodeTuneMidi } from "../tune-midi";
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
