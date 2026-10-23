import type { MutedNote, Recording } from "./db";
import { freqToMidi, type Frame, type NoteEvent } from "./notes";
import { resolveRecordingSettings } from "./recording-settings";
import { resolveKnobs } from "./melody/knobs";
import { interpretMelody } from "./melody/interpret";
import { melodySettingFor, type MelodySetting } from "./melody/settings";
import { analysisOptionsFor } from "./recording-profiles";
export interface NoteItem {
  raw: NoteEvent;
  note: NoteEvent;
  muted: boolean;
}
export const covers = (anchor: MutedNote, raw: NoteEvent): boolean =>
  anchor.t >= raw.start &&
  anchor.t <= raw.start + raw.duration &&
  Math.abs(anchor.midi - raw.midi) <= 1;
export function processRecording(rec: Recording, frames: Frame[]) {
  const settings = resolveRecordingSettings(rec);
  const { preset, overrides, key } = settings.melody;
  const { minFreq, maxFreq } = analysisOptionsFor(rec);
  const interpretation = interpretMelody(frames, {
    knobs: resolveKnobs(preset, overrides),
    key,
    timing: { bpm: rec.bpm, beatsPerBar: rec.beatsPerBar },
    range: { minMidi: freqToMidi(minFreq), maxMidi: freqToMidi(maxFreq) },
  });
  const muted = rec.muted ?? [];
  const items = interpretation.decoded.map((raw, index) => ({
    raw,
    note: interpretation.notes[index]!,
    muted: muted.some((anchor) => covers(anchor, raw)),
  }));
  return {
    settings,
    interpretation,
    items,
    notes: items.filter((item) => !item.muted).map((item) => item.note),
  };
}
export function recordingNotes(rec: Recording, frames: Frame[]): NoteEvent[] {
  return processRecording(rec, frames).notes;
}
export function previewNotes(
  rec: Recording,
  frames: Frame[],
  change: Partial<MelodySetting>,
): NoteEvent[] {
  const melody = { ...melodySettingFor(rec), ...change };
  return recordingNotes({ ...rec, melody }, frames);
}
