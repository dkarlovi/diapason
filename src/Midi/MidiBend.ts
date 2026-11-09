import { bendSamples } from "../Melody/PitchCurve";
import type { NoteEvent } from "../Melody/Notes";
import type { MidiBendMessage, MidiEvent } from "./Midi.type";

export function bendMessages(note: NoteEvent): MidiBendMessage[] {
  if (!note.bend || note.bend.glide <= 0.4) return [];
  const samples = bendSamples(note);
  const range = Math.max(
    1,
    Math.min(48, Math.ceil(Math.max(...samples.map((p) => Math.abs(p.offset))))),
  );
  const setup: MidiBendMessage[] = [101, 100, 6, 38, 101, 100].map((controller, i) => ({
    position: 0,
    type: "control",
    controller,
    value: [0, 0, range, 0, 127, 127][i]!,
  }));
  return [
    ...setup,
    ...samples.map(({ position, offset }): MidiBendMessage => ({
      position,
      type: "bend",
      value: Math.max(0, Math.min(16383, Math.round(8192 + (offset / range) * 8192))),
    })),
  ];
}

export function midiMessage(event: MidiEvent, velocity: number): number[] {
  if (event.type === "control") return [0xb0, event.controller, event.value];
  if (event.type === "bend") return [0xe0, event.value & 127, event.value >> 7];
  return [event.type === "on" ? 0x90 : 0x80, event.midi & 127, event.type === "on" ? velocity : 0];
}
