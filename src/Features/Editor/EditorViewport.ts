import { traceHorizontalPadding } from "../../Audio/Trace";
import { bendSamples } from "../../Melody/PitchCurve";
import type { NoteEvent } from "../../Melody/Notes";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function timeWindow(duration: number, zoom: number, pan: number, visible = 1) {
  const length = Math.max(duration, 1) / Math.max(1, zoom);
  const tMin = clamp(pan, 0, 1) * (Math.max(duration, 1) - length * visible);
  return { tMin, tMax: tMin + length };
}
export function zoomedTime(
  current: { duration: number; zoom: number; pan: number; visible: number },
  factor: number,
  anchor: number,
) {
  const zoom = clamp(current.zoom * factor, 1, 32);
  const view = timeWindow(current.duration, current.zoom, current.pan, current.visible);
  const length = Math.max(current.duration, 1) / zoom;
  const start = view.tMin + (view.tMax - view.tMin - length) * anchor;
  const maxStart = Math.max(current.duration, 1) - length * current.visible;
  return { zoom, pan: maxStart > 0 ? clamp(start / maxStart, 0, 1) : 0 };
}

export function followPan(
  duration: number,
  zoom: number,
  pan: number,
  position: number,
  visible = 1,
) {
  const { tMin, tMax } = timeWindow(duration, zoom, pan, visible);
  const length = (tMax - tMin) * visible;
  const maxStart = Math.max(duration, 1) - length;
  if (!maxStart || (position >= tMin && position < tMin + length * 0.85)) return pan;
  return clamp((position - length * 0.2) / maxStart, 0, 1);
}
export function fittedPitch(notes: (Pick<NoteEvent, "midi"> & Partial<NoteEvent>)[]) {
  if (!notes.length) return { midiMin: 67, midiMax: 96 };
  let min = Infinity,
    max = -Infinity;
  for (const note of notes) {
    min = Math.min(min, note.midi);
    max = Math.max(max, note.midi);
    if (note.bend) {
      const samples = bendSamples({
        ...note,
        start: note.start ?? 0,
        duration: note.duration ?? 1,
        name: note.name ?? "",
      });
      for (const sample of samples) {
        min = Math.min(min, note.midi + sample.offset);
        max = Math.max(max, note.midi + sample.offset);
      }
    }
  }
  const midiMin = Math.floor(min) - 2;
  return { midiMin, midiMax: Math.max(Math.ceil(max) + 2, midiMin + 6) };
}
export function sidebarWidth(width: number, workspace: number) {
  return clamp(width, Math.min(286, workspace / 2), workspace / 2);
}

export function uncoveredTimeFraction(workspace: number, overlay: number) {
  if (!overlay) return 1;
  const padding = traceHorizontalPadding(workspace, true);
  return Math.max(
    0.1,
    (workspace - overlay - padding.left - 12) / (workspace - padding.left - padding.right),
  );
}
/**
 * The pitch-pan change that keeps a note clear of an overlay covering the bottom
 * `covered` fraction of the plot, or 0 when the note is already visible.
 */
export function revealPitchShift(
  view: { midiMin: number; midiMax: number },
  midi: number,
  covered: number,
) {
  const span = view.midiMax - view.midiMin || 1;
  const fraction = (view.midiMax - midi) / span;
  const clear = 1 - covered;
  if (fraction >= 0.05 && fraction <= clear - 0.05) return 0;
  // Centre the note within the uncovered area: shift the view's top so it lands at clear / 2.
  return midi + (clear / 2) * span - view.midiMax;
}

export const TRANSPOSE_MS = 400;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Rises fast to 1 at a third of the way, then eases back to 0. */
const overshoot = (t: number) => (27 / 4) * t * (1 - t) ** 2;
/**
 * One step of an animated transposition. The framing scrolls by `shift`; the notes move by
 * `shift` plus a brief `lead` (in semitones, toward the target) so they appear to travel.
 */
export function transposeFrame(from: number, to: number, elapsed: number, lead = 0) {
  const progress = Math.min(1, Math.max(0, elapsed / TRANSPOSE_MS));
  return {
    shift: from + (to - from) * easeOut(progress),
    lead: Math.sign(to - from) * lead * overshoot(progress),
    done: progress >= 1,
  };
}
export function pitchAboveSheet(
  range: { midiMin: number; midiMax: number },
  selected: { midiMin: number; midiMax: number },
  covered: number,
) {
  const span = Math.min(
    127,
    (selected.midiMax - selected.midiMin + 2) / (1 - clamp(covered, 0, 0.8)),
  );
  const center = selected.midiMax + 1 - span / 2;
  return {
    zoom: (range.midiMax - range.midiMin) / span,
    pan: center - (range.midiMin + range.midiMax) / 2,
  };
}
