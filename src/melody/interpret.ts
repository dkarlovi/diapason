import type { Frame, NoteEvent } from "../notes";
import { decodeMelody } from "./decode";
import { inferHarmony, type ChordSpan } from "./harmony";
import { parallelKey, rankKeys, type Key, type KeyScore } from "./key";
import type { Knobs } from "./knobs";
import { applyFeel } from "./rhythm";
export type KeyChoice = "auto" | Key;
export interface Interpretation {
  knobs: Knobs;
  key: { chosen: Key | null; auto: boolean; ranked: KeyScore[] };
  harmony: ChordSpan[];
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
  const faithful = decodeMelody(
    frames,
    { ...knobs, pitchTrust: 1, keyPull: 0, harmonyPull: 0, leapPenalty: 0, maxMoveSemitones: 0 },
    { key: null, harmony: [], range },
  );
  const ranked = rankKeys(faithful);
  let chosen: Key | null = faithful.length
    ? input.key === "auto"
      ? (ranked[0]?.key ?? null)
      : input.key
    : null;
  if (chosen && Math.abs(knobs.modeBias) >= 0.5)
    chosen = parallelKey(chosen, knobs.modeBias > 0 ? "major" : "minor");
  const harmony = chosen ? inferHarmony(faithful, chosen, timing, knobs.harmonyRate) : [];
  const decoded = decodeMelody(frames, knobs, { key: chosen, harmony, range });
  return {
    knobs,
    key: { chosen, auto: input.key === "auto", ranked },
    harmony,
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
