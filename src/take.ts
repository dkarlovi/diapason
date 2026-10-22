// A take's notes as the user hears/exports them: segmented with its tuning, quantized
// with its grid setting, minus the notes the user muted. Shared by editor and library.

import type { MutedNote, QuantizeSetting, Recording } from './db';
import { segmentNotes, type Frame, type NoteEvent } from './notes';
import { quantizeNotes } from './quantize';

export const DEFAULT_QUANTIZE: QuantizeSetting = { on: true, subdivision: 2 };

/** A detected note: `raw` as segmented, `note` as shown/exported (maybe quantized). */
export interface NoteItem {
  raw: NoteEvent;
  note: NoteEvent;
  muted: boolean;
}

export const covers = (m: MutedNote, raw: NoteEvent): boolean =>
  m.t >= raw.start && m.t <= raw.start + raw.duration && Math.abs(m.midi - raw.midi) <= 1;

export function takeItems(rec: Recording, frames: Frame[]): NoteItem[] {
  const seg = segmentNotes(frames, rec.tuning);
  const q = rec.quantize ?? DEFAULT_QUANTIZE;
  const shown = q.on ? quantizeNotes(seg, { bpm: rec.bpm, subdivision: q.subdivision }) : seg;
  const muted = rec.muted ?? [];
  return seg.map((raw, i) => ({ raw, note: shown[i]!, muted: muted.some((m) => covers(m, raw)) }));
}

/** Notes that are switched on — what gets played and exported. */
export function takeNotes(rec: Recording, frames: Frame[]): NoteEvent[] {
  return takeItems(rec, frames).filter((i) => !i.muted).map((i) => i.note);
}
