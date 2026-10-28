// Minimal Standard MIDI File (Type 0) writer — no dependencies.
// Recordings note events { midi, start (s), duration (s) } and returns a Blob you can download.

import type { NoteEvent } from "./notes";

export interface MidiOptions {
  /** Ticks per quarter note. Default 480. */
  ppq?: number;
  /** Tempo used for the seconds->ticks conversion. Default 120. */
  bpm?: number;
  /** Note-on velocity. Default 96. */
  velocity?: number;
}

export function midiVarLen(value: number): number[] {
  // MIDI variable-length quantity.
  const bytes = [value & 0x7f];
  value >>= 7;
  while (value > 0) {
    bytes.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return bytes;
}

const str = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

const u32 = (n: number): number[] => [
  (n >> 24) & 0xff,
  (n >> 16) & 0xff,
  (n >> 8) & 0xff,
  n & 0xff,
];

const u16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];

export interface MidiEvent {
  tick: number;
  type: "on" | "off";
  midi: number;
}

/** Absolute events shared by diagnostic evidence and the file writer. */
export function midiEvents(events: NoteEvent[], opts: MidiOptions = {}): MidiEvent[] {
  const bpm = opts.bpm ?? 120;
  const ppq = opts.ppq ?? 480;
  const secToTicks = (sec: number) => Math.round((sec * bpm * ppq) / 60);
  // Build an absolute-time list of note-on / note-off events.
  const abs: MidiEvent[] = [];
  let previousOff = -1;
  for (const e of events) {
    const on = secToTicks(e.start);
    const off = secToTicks(e.start + e.duration);
    if (on < previousOff)
      throw new Error("MIDI resolution cannot preserve distinct monophonic notes at this PPQ.");
    previousOff = Math.max(off, on + 1);
    abs.push({ tick: on, type: "on", midi: e.midi });
    abs.push({ tick: Math.max(off, on + 1), type: "off", midi: e.midi });
  }
  // Sort by tick; note-off before note-on at the same tick to free the pitch.
  abs.sort((a, b) => a.tick - b.tick || (a.type === "off" ? -1 : 1));

  return abs;
}

export function notesToMidi(events: NoteEvent[], opts: MidiOptions = {}): Blob {
  const ppq = opts.ppq ?? 480;
  const bpm = opts.bpm ?? 120;
  const velocity = opts.velocity ?? 96;
  const usPerQuarter = Math.round(60000000 / bpm);

  const abs = midiEvents(events, opts);

  const track: number[] = [];
  // Tempo meta event.
  track.push(...midiVarLen(0), 0xff, 0x51, 0x03, ...u32(usPerQuarter).slice(1));

  let prev = 0;
  for (const ev of abs) {
    const delta = ev.tick - prev;
    prev = ev.tick;
    const status = ev.type === "on" ? 0x90 : 0x80;
    const vel = ev.type === "on" ? velocity : 0;
    track.push(...midiVarLen(delta), status, ev.midi & 0x7f, vel);
  }
  // End of track.
  track.push(...midiVarLen(0), 0xff, 0x2f, 0x00);

  const header = [...str("MThd"), ...u32(6), ...u16(0), ...u16(1), ...u16(ppq)];
  const trackChunk = [...str("MTrk"), ...u32(track.length), ...track];

  return new Blob([new Uint8Array([...header, ...trackChunk])], { type: "audio/midi" });
}
