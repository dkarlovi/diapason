import { requireTune, finiteBetween } from "../Tune/Tune.validation";
import type { Recording } from "./Recording.type";
import {
  DETECTION_KNOBS,
  isKnobs,
  resolveKnobs,
  interpretationVersionForControls,
} from "../Melody/Knobs";
import { melodySettingFor } from "../Melody/Settings";
import { interpretMelody } from "../Melody/Interpret";
import { protectedNoteBoundaries } from "../Editing/NoteEdits";
import { freqToMidi, type Frame } from "../Melody/Notes";
import { analysisOptionsFor } from "./RecordingProfiles";
import type { Segment } from "../Melody/Decode.type";
import type { NoteSource } from "./NoteSource.type";

export function noteSourceFromAnalysis(
  record: Recording,
  frames: Frame[],
  segments?: Segment[],
): NoteSource {
  const { preset, overrides, key } = melodySettingFor(record);
  const knobs = resolveKnobs(preset, overrides);
  const { minFreq, maxFreq } = analysisOptionsFor(record);
  const range = { minMidi: freqToMidi(minFreq), maxMidi: freqToMidi(maxFreq) };
  return {
    version: 1,
    interpretationVersion: interpretationVersionForControls(knobs, overrides),
    range,
    segments:
      segments ??
      interpretMelody(frames, {
        knobs,
        key,
        range,
        timing: record,
        protectedBoundaries: protectedNoteBoundaries(record.noteEdits),
      }).segments,
    frozenDetection: {
      steadiness: knobs.steadiness,
      minNoteMs: knobs.minNoteMs,
      silenceGapMs: knobs.silenceGapMs,
      levelGate: knobs.levelGate,
    },
  };
}
function validateSourceContext(source: NoteSource, historical: boolean) {
  requireTune(source && typeof source === "object");
  requireTune(source.version === 1);
  requireTune(
    historical
      ? Number.isSafeInteger(source.interpretationVersion) && source.interpretationVersion > 0
      : source.interpretationVersion === 1 || source.interpretationVersion === 2,
  );
  requireTune(Array.isArray(source.segments));
  requireTune(
    source.range &&
      finiteBetween(source.range.minMidi, 0, 127) &&
      finiteBetween(source.range.maxMidi, 0, 127),
  );
  requireTune(source.range.minMidi < source.range.maxMidi);
  requireTune(isKnobs(source.frozenDetection));
  requireTune(DETECTION_KNOBS.every((k) => Number.isFinite(source.frozenDetection[k])));
}
function validateSegment(segment: Segment, previousEnd: number, durationSec: number) {
  requireTune(segment && segment.source);
  requireTune(
    [segment.start, segment.duration, segment.source.start, segment.source.end].every(
      Number.isFinite,
    ),
  );
  requireTune(finiteBetween(segment.pitch, 0, 127));
  requireTune(segment.start >= 0 && segment.duration > 0);
  requireTune(segment.source.start >= previousEnd && segment.source.end > segment.source.start);
  requireTune(segment.source.end <= durationSec);
  requireTune(segment.source.start === segment.start);
  requireTune(Math.abs(segment.source.end - segment.start - segment.duration) <= 1e-9);
  requireTune(segment.start + segment.duration <= durationSec + 1e-9);
}
export function validateNoteSource(
  value: unknown,
  durationSec: number,
  historical = false,
): NoteSource {
  const source = value as NoteSource;
  validateSourceContext(source, historical);
  let end = 0;
  for (const segment of source.segments) {
    validateSegment(segment, end, durationSec);
    end = segment.source.end;
  }
  return source;
}
