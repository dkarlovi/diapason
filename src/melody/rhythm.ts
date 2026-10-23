import type { NoteEvent } from "../notes";
import { quantizeSequence } from "../quantize";
import type { Knobs } from "./knobs";
// Fewer onsets than this give no reliable estimate of the grid phase.
const MIN_PHASE_NOTES = 4;
/**
 * Constant lag of the performance behind the click, in seconds, within half a
 * beat. Monitoring and capture latency delay every onset by the same amount;
 * snapping without removing it pushes onsets onto the rounding boundary.
 * Onsets are folded onto the grid step first, then the step-sized ambiguity is
 * resolved toward beats, weighted by note length (long notes sit on beats).
 */
function gridLag(notes: NoteEvent[], timing: { bpm: number }, subdivision: number): number {
  const beat = 60 / timing.bpm;
  if (notes.length < MIN_PHASE_NOTES || !(beat > 0) || !Number.isFinite(beat)) return 0;
  const vote = (phase: number) =>
    notes.reduce(
      (sum, note) => sum + note.duration * Math.cos(2 * Math.PI * (note.start / beat - phase)),
      0,
    );
  let x = 0,
    y = 0;
  for (const note of notes) {
    const angle = 2 * Math.PI * subdivision * (note.start / beat);
    x += note.duration * Math.cos(angle);
    y += note.duration * Math.sin(angle);
  }
  const folded = Math.atan2(y, x) / (2 * Math.PI * subdivision);
  let phase = folded;
  for (let k = 1; k < subdivision; k++)
    if (vote(folded + k / subdivision) > vote(phase)) phase = folded + k / subdivision;
  phase -= Math.round(phase);
  return phase * beat;
}
export function applyFeel(notes: NoteEvent[], knobs: Knobs, timing: { bpm: number }): NoteEvent[] {
  const candidate = knobs.grid ? 60 / timing.bpm / knobs.grid : 0;
  const step = candidate > 0 && Number.isFinite(candidate) ? candidate : 0;
  const lag = step ? Math.min(gridLag(notes, timing, knobs.grid), notes[0]?.start ?? 0) : 0;
  const aligned = lag ? notes.map((note) => ({ ...note, start: note.start - lag })) : notes;
  const gridded = step
    ? quantizeSequence(aligned, { bpm: timing.bpm, subdivision: knobs.grid }).notes
    : notes;
  const base = aligned.map(
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
    // Swing delays off-beat halves of a beat, so only even grids have them; a
    // push anticipates by at most an eighth, whatever the grid.
    const swung = knobs.grid % 2 === 0 && subdivision % 2 === 1;
    return Math.max(
      0,
      start +
        (swung ? knobs.swing * step : 0) -
        (anticipate ? knobs.syncopation * Math.min(step, (knobs.grid * step) / 2) : 0),
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
