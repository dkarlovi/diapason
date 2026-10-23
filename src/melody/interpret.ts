import type { Frame, NoteEvent } from "../notes";
import { notesFromSegments, segmentMelody } from "./decode";
import { inferHarmony, type ChordSpan } from "./harmony";
import {
  fitTuning,
  parallelKey,
  rankKeys,
  scalePitchClasses,
  type Key,
  type KeyScore,
} from "./key";
import type { Knobs } from "./knobs";
import { applyFeel } from "./rhythm";
export type KeyChoice = "auto" | Key;
export interface Interpretation {
  knobs: Knobs;
  key: { chosen: Key | null; auto: boolean; ranked: KeyScore[] };
  harmony: ChordSpan[];
  /** Performer's tuning offset from A440, in semitones. */
  tuning: number;
  faithful: NoteEvent[];
  decoded: NoteEvent[];
  notes: NoteEvent[];
}
export function interpretMelody(
  frames: Frame[],
  input: {
    knobs: Knobs;
    key: KeyChoice;
    timing: { bpm: number; beatsPerBar: number };
    range: { minMidi: number; maxMidi: number };
  },
): Interpretation {
  const { knobs, range, timing } = input;
  const segments = segmentMelody(frames, knobs);
  const hop = frames.length > 1 ? frames[1]!.t - frames[0]!.t : 0;
  const performed = segments.map((segment) => ({
    pitch: segment.pitch,
    duration: (segment.end - segment.start) * hop,
  }));
  const performedTuning = fitTuning(performed);
  const faithful = notesFromSegments(
    segments,
    frames,
    { ...knobs, pitchTrust: 1, keyPull: 0, harmonyPull: 0, leapPenalty: 0, maxMoveSemitones: 0 },
    { key: null, harmony: [], range, tuning: performedTuning },
  );
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
      ? fitTuning(performed, scalePitchClasses(chosen))
      : performedTuning;
  if (chosen && Math.abs(knobs.modeBias) >= 0.5)
    chosen = parallelKey(chosen, knobs.modeBias > 0 ? "major" : "minor");
  const harmony = chosen ? inferHarmony(faithful, chosen, timing, knobs.harmonyRate) : [];
  const decoded = notesFromSegments(segments, frames, knobs, {
    key: chosen,
    harmony,
    range,
    tuning,
  });
  return {
    knobs,
    key: { chosen, auto: input.key === "auto", ranked },
    harmony,
    tuning,
    faithful,
    decoded,
    notes: applyFeel(decoded, knobs, timing),
  };
}
export function agreement(a: NoteEvent[], b: NoteEvent[]): number {
  let previous = Int32Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++)
      current[j] = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1]!.midi === b[j - 1]!.midi ? 0 : 1),
      );
    [previous, current] = [current, previous];
  }
  return previous[b.length]!;
}
