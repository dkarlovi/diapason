import { traceHorizontalPadding } from "./trace";
import type { NoteEvent } from "./notes";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function timeWindow(duration: number, zoom: number, pan: number, visible = 1) {
  const length = Math.max(duration, 1) / Math.max(1, zoom);
  const tMin = clamp(pan, 0, 1) * (Math.max(duration, 1) - length * visible);
  return { tMin, tMax: tMin + length };
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
export function fittedPitch(notes: Pick<NoteEvent, "midi">[]) {
  if (!notes.length) return { midiMin: 67, midiMax: 96 };
  let min = Infinity,
    max = -Infinity;
  for (const note of notes) {
    min = Math.min(min, note.midi);
    max = Math.max(max, note.midi);
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
