import { hasProperties } from "../Encoding/Properties";
import { midiToName, type NoteEvent } from "./Notes";
import type { PitchPoint } from "./PitchCurve.type";

export function snapGlide(value: number): number {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded < 0.1 ? 0 : bounded < 0.3 ? 0.2 : bounded < 0.4 ? 0.4 : bounded;
}

export function isPitchCurve(value: unknown): value is PitchPoint[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 32) return false;
  const points: readonly unknown[] = value;
  let previous = -1;
  for (const point of points) {
    if (!validCurvePoint(point) || point.position <= previous) return false;
    const { position } = point;
    if (previous === -1 && position !== 0) return false;
    previous = position;
  }
  const last = points.at(-1);
  return previous === 1 && hasProperties(last, "offset") && last.offset === 0;
}

function validCurvePoint(point: unknown): point is PitchPoint {
  if (!hasProperties(point, "position", "offset")) return false;
  const { position, offset } = point;
  return (
    typeof position === "number" &&
    Number.isFinite(position) &&
    position >= 0 &&
    position <= 1 &&
    typeof offset === "number" &&
    Number.isFinite(offset) &&
    Math.abs(offset) <= 48
  );
}

function curveOffset(points: readonly PitchPoint[], position: number, share: number): number {
  if (position <= 0) return points[0]!.offset;
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1]!,
      right = points[i]!;
    if (position > right.position) continue;
    const fraction = (position - left.position) / (right.position - left.position);
    const t = Math.max(0, Math.min(1, (fraction - (1 - share)) / share));
    return left.offset + (right.offset - left.offset) * t * t * (3 - 2 * t);
  }
  return points.at(-1)!.offset;
}

export function notePitchAt(note: NoteEvent, position: number): number {
  const bend = note.bend;
  if (!bend || bend.glide === 0) return note.midi;
  if (bend.glide <= 0.4) {
    const step = bend.glide <= 0.2 ? 2 : 1;
    return Math.max(
      0,
      Math.min(127, note.midi + Math.round(curveOffset(bend.points, position, 1) / step) * step),
    );
  }
  const share = 0.08 + (0.92 * (bend.glide - 0.4)) / 0.6;
  return Math.max(0, Math.min(127, note.midi + curveOffset(bend.points, position, share)));
}

export function bendSamples(note: NoteEvent): PitchPoint[] {
  if (!note.bend) return [];
  const count = Math.min(256, Math.max(16, Math.ceil(note.duration / 0.02)));
  const positions = Array.from({ length: count + 1 }, (_, i) => i / count);
  const share = 0.08 + (0.92 * (note.bend.glide - 0.4)) / 0.6;
  note.bend.points.forEach((point, i, points) => {
    positions.push(point.position);
    if (i && note.bend!.glide > 0.4)
      positions.push(point.position - (point.position - points[i - 1]!.position) * share);
  });
  return [...new Set(positions)]
    .toSorted((a, b) => a - b)
    .map((position) => ({
      position,
      offset: notePitchAt(note, position) - note.midi,
    }));
}

function crossing(points: PitchPoint[], from: number, to: number, target: number): number {
  let left = from,
    right = to;
  const ascending = curveOffset(points, right, 1) > curveOffset(points, left, 1);
  for (let i = 0; i < 32; i++) {
    const middle = (left + right) / 2;
    if (curveOffset(points, middle, 1) < target === ascending) left = middle;
    else right = middle;
  }
  return (left + right) / 2;
}

function steppedPositions(note: NoteEvent): number[] {
  const { points, glide } = note.bend!;
  const step = glide <= 0.2 ? 2 : 1;
  const positions = [0, 1];
  for (let i = 1; i < points.length; i++) {
    const left = points[i - 1]!,
      right = points[i]!;
    const low = Math.min(left.offset, right.offset),
      high = Math.max(left.offset, right.offset);
    for (let k = Math.ceil(low / step - 0.5); (k + 0.5) * step < high; k++) {
      const target = (k + 0.5) * step;
      if (target > low) positions.push(crossing(points, left.position, right.position, target));
    }
  }
  return [...new Set(positions)].toSorted((a, b) => a - b);
}

export function steppedNotes(notes: readonly NoteEvent[]): NoteEvent[] {
  const result: NoteEvent[] = [];
  for (const note of notes) {
    if (!note.bend || note.bend.glide > 0.4) {
      result.push(note);
      continue;
    }
    appendSteppedNote(result, note);
  }
  return result;
}

function appendSteppedNote(result: NoteEvent[], note: NoteEvent) {
  const positions = note.bend!.glide ? steppedPositions(note) : [0, 1];
  for (let i = 1; i < positions.length; i++) {
    const from = positions[i - 1]!,
      to = positions[i]!;
    const midi = notePitchAt(note, (from + to) / 2);
    const start = note.start + from * note.duration;
    const end = note.start + to * note.duration;
    const previous = result.at(-1);
    if (i > 1 && previous?.midi === midi) previous.duration = end - previous.start;
    else result.push({ midi, name: midiToName(midi), start, duration: end - start });
    if (result.length > 20000) throw new Error("Glide produces too many MIDI notes.");
  }
}
