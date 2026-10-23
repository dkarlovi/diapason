import type { NoteEvent } from "../notes";
import { quantizeSequence } from "../quantize";
import type { Knobs } from "./knobs";
export function applyFeel(
  notes: NoteEvent[],
  knobs: Knobs,
  timing: { bpm: number; beatsPerBar: number },
): NoteEvent[] {
  const step = knobs.grid ? 60 / timing.bpm / knobs.grid : 0;
  const gridded =
    step > 0 && Number.isFinite(step)
      ? quantizeSequence(notes, { bpm: timing.bpm, subdivision: knobs.grid }).notes
      : notes;
  const base = notes.map(
    (note, i) => note.start + (gridded[i]!.start - note.start) * knobs.gridPull,
  );
  let starts = base.map((start, i) => {
    if (!step) return start;
    const position = gridded[i]!.start / step;
    // Collision fallbacks are intentionally off-grid and retain performed timing.
    if (Math.abs(position - Math.round(position)) > 1e-7) return start;
    const subdivision = Math.round(position);
    const onBeat = subdivision % knobs.grid === 0;
    const anticipate = onBeat && Math.round(subdivision / knobs.grid) % 2 === 1;
    return Math.max(
      0,
      start +
        (subdivision % 2 === 1 ? knobs.swing * step : 0) -
        (anticipate ? knobs.syncopation * step : 0),
    );
  });
  // Dense passages may not have room for displacement. Preserve their ordered
  // base timing rather than deleting notes or changing their sequence.
  if (starts.some((start, i) => i > 0 && start <= starts[i - 1]!)) starts = base;
  return notes.map((note, i) => {
    const start = starts[i]!;
    const duration =
      (note.duration + (gridded[i]!.duration - note.duration) * knobs.gridPull) *
      knobs.articulation;
    return { ...note, start, duration: Math.min(duration, (starts[i + 1] ?? Infinity) - start) };
  });
}
