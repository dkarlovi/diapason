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
