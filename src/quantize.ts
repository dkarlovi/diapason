// Snap note events to a tempo grid so exported MIDI has clean rhythm.

import type { NoteEvent } from "./notes";

export interface QuantizeOptions {
  bpm: number;
  /** Grid divisions per beat: 1 = quarter, 2 = eighth, 3 = triplet, 4 = sixteenth. */
  subdivision: number;
}

/** Snap each note's start and end to the nearest grid line; keep a minimum of one step. */
export function quantizeNotes(notes: NoteEvent[], opts: QuantizeOptions): NoteEvent[] {
  const step = 60 / opts.bpm / opts.subdivision;
  if (!(step > 0)) return notes.map((n) => ({ ...n }));

  return notes.map((n) => {
    const start = Math.round(n.start / step) * step;
    let end = Math.round((n.start + n.duration) / step) * step;
    if (end <= start) end = start + step;
    return { ...n, start, duration: end - start };
  });
}
