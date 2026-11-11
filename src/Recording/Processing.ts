import { bendEditFor } from "../Editing/BendEdits";
import {
  isNoteEdits,
  pitchEditFor,
  protectedNoteBoundaries,
  summarizePitchEdits,
} from "../Editing/NoteEdits";
import type { MutedNote, Recording } from "./Recording.type";
import { freqToMidi, midiToName, type Frame, type NoteEvent } from "../Melody/Notes";
import { resolveRecordingSettings } from "./RecordingSettings";
import { interpretationVersionForControls, resolveKnobs } from "../Melody/Knobs";
import { interpretSegments, interpretMelody } from "../Melody/Interpret";
import { melodySettingFor } from "../Melody/Settings";
import { analysisOptionsFor } from "./RecordingProfiles";
import type { MelodySetting } from "../Melody/MelodySetting.type";
import type { NoteItem } from "./NoteItem.type";
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
  const knobs = resolveKnobs(preset, overrides);
  const version = interpretationVersionForControls(
    knobs,
    rec.noteEdits?.bend?.length ? { ...overrides, glide: knobs.glide } : overrides,
    rec.noteSource ? rec.noteSource.interpretationVersion : (rec.interpretationVersion ?? 1),
  );
  const input = {
    version,
    ...(rec.noteEdits?.bend
      ? { fixedSegments: rec.noteEdits.bend.map((edit) => edit.segment) }
      : {}),
    protectedBoundaries: protectedNoteBoundaries(rec.noteEdits),
    knobs,
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
    const bend = bendEditFor(rec.noteEdits, source);
    const pitched = edit
      ? { ...automatic, midi: edit.midi, name: midiToName(edit.midi) }
      : automatic;
    const note =
      bend && knobs.glide > 0
        ? { ...pitched, bend: { points: bend.points, glide: knobs.glide } }
        : pitched;
    const axes: NoteItem["editState"]["axes"] = [
      ...(edit ? ["pitch" as const] : []),
      ...(bend ? ["bend" as const] : []),
    ];
    return {
      id: index + 1,
      raw,
      source,
      automatic,
      note,
      editState: {
        ids: [...(edit ? [edit.id] : []), ...(bend ? [bend.id] : [])],
        axes,
        differingAxes: axes.filter((axis) =>
          axis === "pitch"
            ? edit!.midi !== automatic.midi
            : JSON.stringify(bend!.points) !==
              JSON.stringify(interpretation.segments[index]!.curve),
        ),
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
