// @vitest-environment node
import { expect, it } from "vitest";
import { noteRecording } from "../../tests/support/note-recording";
import { createPortableTune } from "../Tune/PortableTune";
import { encodeTuneMidi, decodeTuneMidi } from "./TuneMidi";
it("embeds the editable tune with playable octave-shifted MIDI and instrument", async () => {
  const tune = createPortableTune(noteRecording(), []);
  const bytes = new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("MThd");
  expect(Array.from(bytes)).toContain(73); // flute General MIDI program
  const decoded = await decodeTuneMidi(bytes);
  expect(decoded.play).toEqual({ instrument: "flute", octave: -2 });
  expect(decoded.noteSource.segments.map((s) => s.pitch)).toEqual([72, 74]);
  // The note-on events are standard MIDI at C3/D3, not the unshifted source pitches.
  const on = Array.from(bytes).flatMap((b, i) => (b === 0x90 ? [bytes[i + 1]] : []));
  expect(on).toEqual([48, 50]);
  const changed = bytes.slice();
  const index = changed.indexOf(0x90);
  changed[index + 1] = 49;
  await expect(decodeTuneMidi(changed)).rejects.toThrow(/match|changed/i);
});
it("rejects untagged or malformed MIDI rather than importing generic notes", async () => {
  await expect(decodeTuneMidi(new Uint8Array([1, 2, 3]))).rejects.toThrow();
});
it("parses standard bend controls and detects curve-event tampering", async () => {
  const { readTuneMidiMusic } = await import("./TuneMidiReader");
  const tune = createPortableTune(noteRecording(), []);
  const bytes = new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer());
  const inserted = new Uint8Array([0, 0xb0, 101, 0, 0, 0xe0, 1, 64]);
  const changed = new Uint8Array(bytes.length + inserted.length);
  changed.set(bytes.subarray(0, 22));
  changed.set(inserted, 22);
  changed.set(bytes.subarray(22), 22 + inserted.length);
  new DataView(changed.buffer).setUint32(18, changed.length - 22);
  expect(readTuneMidiMusic(changed).events.slice(0, 2)).toEqual([
    { tick: 0, type: "control", controller: 101, value: 0 },
    { tick: 0, type: "bend", value: 8193 },
  ]);
  await expect(decodeTuneMidi(changed)).rejects.toThrow(/match|changed/i);
});
it("roundtrips v3 source curves with standard bends and rejects modified bend bytes", async () => {
  const { readTuneMidiMusic } = await import("./TuneMidiReader");
  const record = noteRecording();
  record.noteSource.interpretationVersion = 3;
  record.noteSource.segments[0]!.curve = [
    { position: 0, offset: -12 },
    { position: 1, offset: 0 },
  ];
  record.melody!.overrides.glide = 0.7;
  const tune = createPortableTune(record, []);
  const bytes = new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer());
  const music = readTuneMidiMusic(bytes);
  expect(
    music.events.some((e) => e.type === "control" && e.controller === 6 && e.value === 12),
  ).toBe(true);
  expect(music.events.some((e) => e.type === "bend" && e.value === 0)).toBe(true);
  const decoded = await decodeTuneMidi(bytes);
  expect(decoded.noteSource.segments[0]!.curve).toEqual(record.noteSource.segments[0]!.curve);
  expect(decoded.melody.overrides.glide).toBe(0.7);
  const changed = bytes.slice();
  const index = changed.indexOf(0xe0);
  changed[index + 1] = 1;
  await expect(decodeTuneMidi(changed)).rejects.toThrow(/match|changed/i);
});
