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
import type { Segment, InterpretationVersion } from "./Decode.type";

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
  version?: InterpretationVersion;
  fixedSegments?: Segment[];
  key: KeyChoice;
  timing: { bpm: number; beatsPerBar: number };
  range: { minMidi: number; maxMidi: number };
}
export function interpretMelody(
  frames: Frame[],
  input: SegmentInterpretationInput & { protectedBoundaries?: readonly number[] },
): Interpretation {
  // V3 retains contour detection at zero Glide; v4 enables it through the control.
  const detected = segmentMelody(
    frames,
    input.knobs,
    input.protectedBoundaries,
    input.version === 4 || input.version === undefined
      ? input.knobs.glide > 0
        ? 3
        : 1
      : input.version,
  );
  const fixed = input.fixedSegments ?? [];
  const segments = fixed.length
    ? detected
        .filter(
          (segment) =>
            !fixed.some(
              (candidate) =>
                candidate.source.start < segment.source.end &&
                segment.source.start < candidate.source.end,
            ),
        )
        .concat(fixed)
        .toSorted((a, b) => a.start - b.start)
    : detected;
  return interpretSegments(segments, input);
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
  // Historical tunes retain their scale-dependent tuning and mode precedence.
  const legacy = (input.version ?? 4) < 4;
  const tuning =
    legacy && chosen && input.key !== "auto"
      ? fitTuning(segments, scalePitchClasses(chosen))
      : performedTuning;
  if (chosen && knobs.mode !== "auto" && (legacy || input.key === "auto"))
    chosen = parallelKey(chosen, knobs.mode);
  const harmony = chosen ? inferHarmony(faithful, chosen, timing, "bar") : [];
  const meter = { beat: 60 / timing.bpm, lag: gridLag(faithful, timing, 2) };
  const decoded = notesFromSegments(segments, knobs, {
    key: chosen,
    harmony: !legacy && knobs.keyPull === 0 ? [] : harmony,
    range,
    tuning,
    meter,
  });
  const notes = applyFeel(decoded, knobs, timing).map((note, i) => {
    const points = segments[i]!.curve;
    return points && knobs.glide > 0
      ? Object.assign({}, note, { bend: { points, glide: knobs.glide } })
      : note;
  });
  return {
    segments,
    knobs,
    key: { chosen, auto: input.key === "auto", ranked },
    harmony,
    tuning,
    faithful,
    decoded,
    notes,
  };
}
