import type { PitchContext, Segment } from "./Decode.type";

const NATURAL_MINOR = new Set([0, 2, 3, 5, 7, 8, 10]);
const MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

/** Scale evidence weighted by the Context correction control in the decoder. */
export function contextPitchScore(segment: Segment, midi: number, context: PitchContext): number {
  if (!context.key) return 0;
  const { tonic, mode } = context.key;
  const degree = (((midi - tonic) % 12) + 12) % 12;
  const scale = mode === "minor" ? NATURAL_MINOR : MAJOR;
  if (scale.has(degree)) return 0;
  const time = segment.start + segment.duration / 2;
  const chord = context.harmony.find((span) => span.start <= time && time < span.end);
  // A minor key uses its raised seventh over the major dominant, rather than
  // preferring that raised note equally in every phrase.
  const dominant = [7, 11, 2].every((step) => chord?.pitchClasses.has((tonic + step) % 12));
  return mode === "minor" && degree === 11 && dominant ? 0 : -4;
}
