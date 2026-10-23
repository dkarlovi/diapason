// A recording's notes as the user hears/exports them: segmented with its tuning, quantized
// with its grid setting, minus the notes the user muted. Shared by editor and library.

import type { MutedNote, Recording } from "./db";
import { segmentNotes, type Frame, type NoteEvent } from "./notes";
import { quantizeSequence } from "./quantize";
import { resolveRecordingSettings } from "./recording-settings";
export { DEFAULT_QUANTIZE } from "./recording-settings";

/** A detected note: `raw` as segmented, `note` as shown/exported (maybe quantized). */
export interface NoteItem {
  raw: NoteEvent;
  note: NoteEvent;
  muted: boolean;
}

export const covers = (m: MutedNote, raw: NoteEvent): boolean =>
  m.t >= raw.start && m.t <= raw.start + raw.duration && Math.abs(m.midi - raw.midi) <= 1;

export function processRecording(rec: Recording, frames: Frame[]) {
  const settings = resolveRecordingSettings(rec);
  const segmented = segmentNotes(frames, settings.tuning);
  const quantized = settings.quantize.on
    ? quantizeSequence(segmented, { bpm: rec.bpm, subdivision: settings.quantize.subdivision })
    : { notes: segmented, adjustments: [] };
  const muted = rec.muted ?? [];
  const items = segmented.map((raw, i) => ({
    raw,
    note: quantized.notes[i]!,
    muted: muted.some((m) => covers(m, raw)),
  }));
  return {
    settings,
    segmented,
    quantized: quantized.notes,
    adjustments: quantized.adjustments,
    items,
    notes: items.filter((item) => !item.muted).map((item) => item.note),
  };
}

export function recordingItems(rec: Recording, frames: Frame[]): NoteItem[] {
  return processRecording(rec, frames).items;
}

/** Notes that are switched on — what gets played and exported. */
export function recordingNotes(rec: Recording, frames: Frame[]): NoteEvent[] {
  return processRecording(rec, frames).notes;
}
