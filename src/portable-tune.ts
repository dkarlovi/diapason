import { requireTune, finiteBetween, integerBetween } from "./tune-validation";
import type { NoteRecording, Recording } from "./Recording/Recording.type";
import { DEFAULT_PLAY, INSTRUMENTS, type PlaySettings } from "./instruments";
import {
  isKnobs,
  resolveKnobs,
  withControlDefaults,
  interpretationVersionForControls,
  type Knobs,
} from "./melody/knobs";
import { isMelodySetting, melodySettingFor, type MelodySetting } from "./melody/settings";
import {
  DETECTION_KNOBS,
  noteSourceFromAnalysis,
  validateNoteSource,
  type NoteSource,
} from "./note-source";
import { processRecording } from "./recording";
import type { Frame } from "./notes";

export const TUNE_LIMITS = {
  encoded: 1_048_576,
  decoded: 4_194_304,
  notes: 20_000,
  durationMs: 3_600_000,
  nameBytes: 1024,
};
export interface PortableTune {
  schemaVersion: 1;
  name: string;
  durationMs: number;
  bpm: number;
  beatsPerBar: number;
  noteSource: NoteSource;
  melody: MelodySetting;
  effectiveKnobs: Knobs;
  play: PlaySettings;
  pitchEdits: { noteIndex: number; midi: number }[];
  mutedIndices: number[];
}
export function createPortableTune(record: Recording, frames: Frame[]): PortableTune {
  const processed = processRecording(record, frames);
  const melody = melodySettingFor(record);
  const original = structuredClone(
    record.noteSource ?? noteSourceFromAnalysis(record, frames, processed.interpretation.segments),
  );
  original.interpretationVersion = interpretationVersionForControls(
    processed.interpretation.knobs,
    melody.overrides,
  );
  const rounded = structuredClone(original);
  const ms = (t: number) => Math.round(t * 1000) / 1000;
  for (const segment of rounded.segments) {
    segment.start = ms(segment.start);
    segment.duration = Math.max(0.001, ms(segment.source.end) - segment.start);
    segment.source = { start: ms(segment.source.start), end: ms(segment.source.end) };
  }
  const tune: PortableTune = {
    schemaVersion: 1,
    name: record.name,
    durationMs: Math.ceil(record.durationSec * 1000),
    bpm: record.bpm,
    beatsPerBar: record.beatsPerBar,
    noteSource: rounded,
    melody: structuredClone(melody),
    effectiveKnobs: resolveKnobs(melody.preset, melody.overrides),
    play: { ...DEFAULT_PLAY, ...record.play },
    pitchEdits: processed.items.flatMap((item, noteIndex) =>
      item.editState.axes.length ? [{ noteIndex, midi: item.note.midi }] : [],
    ),
    mutedIndices: processed.items.flatMap((item, noteIndex) => (item.muted ? [noteIndex] : [])),
  };
  // Keep exact interpretation timing only when quantization changes a musical decision.
  const candidate = processRecording(recordingFromPortableTune(tune, "preview", 0), []);
  if (
    candidate.items.some(
      (item, i) =>
        item.automatic.midi !== processed.items[i]?.automatic.midi ||
        Math.abs(item.automatic.start - processed.items[i]!.automatic.start) > 0.001 ||
        Math.abs(item.automatic.duration - processed.items[i]!.automatic.duration) > 0.001,
    ) ||
    JSON.stringify(candidate.interpretation.key.chosen) !==
      JSON.stringify(processed.interpretation.key.chosen) ||
    rounded.segments.some((s) => s.source.end <= s.source.start)
  )
    tune.noteSource = original;
  return validatePortableTune(tune);
}
function validateTuneInfo(t: PortableTune, historical: boolean) {
  requireTune(t.schemaVersion === 1);
  requireTune(typeof t.name === "string");
  requireTune(
    new TextEncoder().encode(t.name).length <=
      (historical ? Number.MAX_SAFE_INTEGER : TUNE_LIMITS.nameBytes),
  );
  requireTune(
    integerBetween(t.durationMs, 0, historical ? Number.MAX_SAFE_INTEGER : TUNE_LIMITS.durationMs),
  );
  requireTune(finiteBetween(t.bpm, 20, 300));
  requireTune(integerBetween(t.beatsPerBar, 1, 12));
}
function validateTuneMusic(t: PortableTune, historical: boolean) {
  requireTune(isMelodySetting(t.melody));
  requireTune(isKnobs(t.effectiveKnobs));
  const savedKnobs = withControlDefaults(t.effectiveKnobs);
  requireTune(
    t.noteSource.interpretationVersion === 2 ||
      interpretationVersionForControls(savedKnobs, t.melody.overrides) === 1,
  );
  requireTune(t.play && INSTRUMENTS.some((i) => i.id === t.play.instrument));
  requireTune([1, 0, -1, -2, -3].includes(t.play.octave));
  const effective = historical ? savedKnobs : resolveKnobs(t.melody.preset, t.melody.overrides);
  requireTune(
    Object.keys(effective).every(
      (k) => effective[k as keyof Knobs] === savedKnobs[k as keyof Knobs],
    ),
  );
  requireTune(
    DETECTION_KNOBS.every((k) => t.noteSource.frozenDetection[k] === t.effectiveKnobs[k]),
  );
}
function validateTuneEdits(t: PortableTune) {
  requireTune(Array.isArray(t.pitchEdits) && Array.isArray(t.mutedIndices));
  const count = t.noteSource.segments.length;
  requireTune(t.pitchEdits.length <= count && t.mutedIndices.length <= count);
  requireTune(
    t.pitchEdits.every(
      (e) => e && integerBetween(e.noteIndex, 0, count - 1) && integerBetween(e.midi, 0, 127),
    ),
  );
  requireTune(t.mutedIndices.every((i) => integerBetween(i, 0, count - 1)));
  requireTune(new Set(t.mutedIndices).size === t.mutedIndices.length);
  requireTune(new Set(t.pitchEdits.map((e) => e.noteIndex)).size === t.pitchEdits.length);
}
export function validatePortableTune(
  value: unknown,
  { historical = false }: { historical?: boolean } = {},
): PortableTune {
  const t = value as PortableTune;
  requireTune(t && typeof t === "object");
  validateTuneInfo(t, historical);
  validateNoteSource(t.noteSource, t.durationMs / 1000, historical);
  requireTune(historical || t.noteSource.segments.length <= TUNE_LIMITS.notes);
  validateTuneMusic(t, historical);
  validateTuneEdits(t);
  return t;
}
export function recordingFromPortableTune(
  tune: PortableTune,
  id: string,
  importedAt: number,
): NoteRecording {
  const noteSource = structuredClone(tune.noteSource);
  const record: NoteRecording = {
    id,
    name: tune.name,
    createdAt: importedAt,
    durationSec: tune.durationMs / 1000,
    bpm: tune.bpm,
    beatsPerBar: tune.beatsPerBar,
    noteSource,
    melody: structuredClone(tune.melody),
    play: { ...tune.play },
  };
  record.noteEdits = {
    version: 1,
    pitch: tune.pitchEdits.map(({ noteIndex, midi }) => ({
      id: `shared-${noteIndex}`,
      ranges: [{ ...noteSource.segments[noteIndex]!.source }],
      midi,
    })),
  };
  // Fixed-note mutes use time membership, so future key changes cannot unmute them.
  record.muted = tune.mutedIndices.map((i) => {
    const s = noteSource.segments[i]!;
    return {
      t: (s.source.start + s.source.end) / 2,
      midi: Math.max(0, Math.min(127, Math.round(s.pitch))),
    };
  });
  return record;
}
