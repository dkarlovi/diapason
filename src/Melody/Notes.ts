// Frequency/MIDI helpers and the shared acoustic frame and note types.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

export function midiToName(midi: number): string {
  const m = Math.round(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

/** A single captured analysis frame. `t` is seconds from capture start. */
export interface Frame {
  t: number;
  freq: number | null;
  clarity: number;
  rms: number;
}

/** A detected note event, ready for MIDI export. Times are in seconds. */
export interface NoteEvent {
  midi: number;
  name: string;
  start: number;
  duration: number;
}
