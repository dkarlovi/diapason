import {
  isNoteEdits,
  pitchEditFor,
  protectedNoteBoundaries,
  summarizePitchEdits,
} from "./note-edits";
import type { MutedNote, Recording } from "./Recording/Recording.type";
import { freqToMidi, midiToName, type Frame, type NoteEvent } from "./notes";
import { resolveRecordingSettings } from "./recording-settings";
import { resolveKnobs } from "./melody/knobs";
import { interpretSegments, interpretMelody } from "./melody/interpret";
import { melodySettingFor } from "./melody/settings";
import { analysisOptionsFor } from "./recording-profiles";
import type { MelodySetting } from "./melody/MelodySetting.type";
import type { NoteItem } from "./Recording/NoteItem.type";
export const covers = (anchor: MutedNote, raw: NoteEvent): boolean =>
  anchor.t >= raw.start &&
  anchor.t <= raw.start + raw.duration &&
  Math.abs(anchor.midi - raw.midi) <= 1;
export function processRecording(rec: Recording, frames: Frame[]) {
  if (rec.noteEdits !== undefined && !isNoteEdits(rec.noteEdits, rec.durationSec))
    throw new Error("Invalid saved note edits");
  const settings = resolveRecordingSettings(rec);
  const { preset, overrides, key } = settings.melody;
  const { minFreq, maxFreq } = analysisOptionsFor(rec);
  const input = {
    protectedBoundaries: protectedNoteBoundaries(rec.noteEdits),
    knobs: resolveKnobs(preset, overrides),
    key,
    timing: { bpm: rec.bpm, beatsPerBar: rec.beatsPerBar },
    range: rec.noteSource?.range ?? { minMidi: freqToMidi(minFreq), maxMidi: freqToMidi(maxFreq) },
  };
  const interpretation = rec.noteSource
    ? interpretSegments(rec.noteSource.segments, input)
    : interpretMelody(frames, input);
  const muted = rec.muted ?? [];
  const items: NoteItem[] = interpretation.decoded.map((raw, index) => {
    const source = interpretation.segments[index]!.source;
    const automatic = interpretation.notes[index]!;
    const edit = pitchEditFor(rec.noteEdits, source);
    return {
      id: index + 1,
      raw,
      source,
      automatic,
      note: edit ? { ...automatic, midi: edit.midi, name: midiToName(edit.midi) } : automatic,
      editState: {
        ids: edit ? [edit.id] : [],
        axes: edit ? ["pitch"] : [],
        differingAxes: edit && edit.midi !== automatic.midi ? ["pitch"] : [],
      },
      fixedSource: !!rec.noteSource,
      muted: muted.some((anchor) =>
        rec.noteSource ? anchor.t >= source.start && anchor.t < source.end : covers(anchor, raw),
      ),
    };
  });
  return {
    editCoverage: summarizePitchEdits(
      rec.noteEdits,
      items.map((item) => item.source),
    ),
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
