import type { NoteEvent } from "./notes";

export interface QuantizeOptions {
  bpm: number;
  /** Grid divisions per beat: 1 = quarter, 2 = eighth, 3 = triplet, 4 = sixteenth. */
  subdivision: number;
}

interface QuantizeAdjustment {
  index: number;
  reason: "onset-collision" | "end-clamped";
  before: NoteEvent;
  after: NoteEvent;
}

/** Preserve the ordered monophonic performance when a grid is too coarse. */
export function quantizeSequence(notes: NoteEvent[], opts: QuantizeOptions) {
  const step = 60 / opts.bpm / opts.subdivision;
  const adjustments: QuantizeAdjustment[] = [];
  if (!(step > 0) || !Number.isFinite(step)) {
    return { notes: notes.map((note) => ({ ...note })), adjustments };
  }
  const snap = (time: number) => Math.round(time / step) * step;
  const starts = notes.map((note) => snap(note.start));
  const fallback = new Set<number>();
  // Restoring one onset can expose a neighboring collision. Each pass marks at
  // least one new note; the original strictly ordered starts are the safe bound.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < starts.length; i++) {
      if (starts[i]! > starts[i - 1]!) continue;
      for (const index of [i - 1, i]) {
        if (fallback.has(index)) continue;
        fallback.add(index);
        starts[index] = notes[index]!.start;
        changed = true;
      }
    }
  }
  const result = notes.map((note, index) => {
    const start = starts[index]!;
    const snappedEnd = snap(note.start + note.duration);
    const duration =
      note.duration < step / 2 || snappedEnd <= start ? note.duration : snappedEnd - start;
    const end = Math.min(start + duration, starts[index + 1] ?? Infinity);
    const after = { ...note, start, duration: end < start + duration ? end - start : duration };
    if (fallback.has(index))
      adjustments.push({ index, reason: "onset-collision", before: note, after });
    if (end < start + duration)
      adjustments.push({ index, reason: "end-clamped", before: note, after });
    return after;
  });
  return { notes: result, adjustments };
}

export function quantizeNotes(notes: NoteEvent[], opts: QuantizeOptions): NoteEvent[] {
  return quantizeSequence(notes, opts).notes;
}
