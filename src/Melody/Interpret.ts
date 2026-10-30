import type { Frame, NoteEvent } from "./Notes";
import { nearestNotes, notesFromSegments, segmentMelody } from "./Decode";
import { inferHarmony, type ChordSpan } from "./Harmony";
import {
  fitTuning,
  parallelKey,
  rankKeys,
  scalePitchClasses,
  type Key,
  type KeyScore,
} from "./Key";
import type { Knobs } from "./Knobs";
import { applyFeel, gridLag } from "./Rhythm";
import type { Segment } from "./Decode.type";

export type KeyChoice = "auto" | Key;
export interface Interpretation {
  segments: Segment[];
  knobs: Knobs;
  key: { chosen: Key | null; auto: boolean; ranked: KeyScore[] };
  harmony: ChordSpan[];
  /** Performer's tuning offset from A440, in semitones. */
  tuning: number;
  faithful: NoteEvent[];
  decoded: NoteEvent[];
  notes: NoteEvent[];
}
export interface SegmentInterpretationInput {
  knobs: Knobs;
  key: KeyChoice;
  timing: { bpm: number; beatsPerBar: number };
  range: { minMidi: number; maxMidi: number };
}
export function interpretMelody(
  frames: Frame[],
  input: SegmentInterpretationInput & { protectedBoundaries?: readonly number[] },
): Interpretation {
  return interpretSegments(segmentMelody(frames, input.knobs, input.protectedBoundaries), input);
}
export function interpretSegments(
  segments: Segment[],
  input: SegmentInterpretationInput,
): Interpretation {
  const { knobs, range, timing } = input;
  const performedTuning = fitTuning(segments);
  const faithful = nearestNotes(segments, performedTuning);
  const ranked = rankKeys(faithful);
  let chosen: Key | null = faithful.length
    ? input.key === "auto"
      ? (ranked[0]?.key ?? null)
      : input.key
    : null;
  // An explicit key fixes the scale the performance is tuned against; moods
  // that change the mode afterwards keep the tuning that was performed.
  const tuning =
    chosen && input.key !== "auto"
      ? fitTuning(segments, scalePitchClasses(chosen))
      : performedTuning;
  if (chosen && knobs.mode !== "auto") chosen = parallelKey(chosen, knobs.mode);
  const harmony = chosen ? inferHarmony(faithful, chosen, timing, "bar") : [];
  const meter = { beat: 60 / timing.bpm, lag: gridLag(faithful, timing, 2) };
  const decoded = notesFromSegments(segments, knobs, {
    key: chosen,
    harmony,
    range,
    tuning,
    meter,
  });
  return {
    segments,
    knobs,
    key: { chosen, auto: input.key === "auto", ranked },
    harmony,
    tuning,
    faithful,
    decoded,
    notes: applyFeel(decoded, knobs, timing),
  };
}
