import type { NoteEvent } from "../notes";
export interface Key {
  tonic: number;
  mode: "major" | "minor";
}
export interface KeyScore {
  key: Key;
  score: number;
}
const PROFILES = {
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};
export function rankKeys(notes: NoteEvent[]): KeyScore[] {
  if (!notes.length) return [];
  const histogram = new Float64Array(12);
  for (const note of notes) histogram[((note.midi % 12) + 12) % 12]! += note.duration;
  const mean = histogram.reduce((sum, value) => sum + value, 0) / 12;
  const centered = histogram.map((value) => value - mean);
  const variance = centered.reduce((sum, value) => sum + value * value, 0);
  const ranked: KeyScore[] = [];
  for (let tonic = 0; tonic < 12; tonic++)
    for (const mode of ["major", "minor"] as const) {
      const profile = PROFILES[mode];
      const avg = profile.reduce((a, b) => a + b, 0) / 12;
      let covariance = 0;
      let profileVariance = 0;
      for (let pc = 0; pc < 12; pc++) {
        const delta = profile[(pc - tonic + 12) % 12]! - avg;
        covariance += centered[pc]! * delta;
        profileVariance += delta * delta;
      }
      ranked.push({
        key: { tonic, mode },
        score: variance === 0 ? 0 : covariance / Math.sqrt(variance * profileVariance),
      });
    }
  return ranked.sort(
    (a, b) => b.score - a.score || a.key.tonic - b.key.tonic || (a.key.mode === "major" ? -1 : 1),
  );
}
export function scalePitchClasses(key: Key): ReadonlySet<number> {
  const intervals = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
  return new Set(intervals.map((interval) => (key.tonic + interval) % 12));
}
export function parallelKey(key: Key, mode: Key["mode"]): Key {
  return { ...key, mode };
}
export function keyName(key: Key): string {
  return `${["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][key.tonic]} ${key.mode}`;
}
// Whistlers rarely sit on A440 and their intervals are approximate. Search the
// offset (within half a semitone) that best fits the performed pitches to one
// diatonic scale, or to the given scale; misses are capped so a deliberate
// chromatic note cannot drag the whole take.
export function fitTuning(
  notes: { pitch: number; duration: number }[],
  scale: ReadonlySet<number> | null = null,
): number {
  const scales = scale
    ? [scale]
    : Array.from({ length: 12 }, (_, tonic) => scalePitchClasses({ tonic, mode: "major" }));
  let best = 0,
    bestCost = Infinity;
  for (let step = -50; step < 50; step++) {
    const tuning = step / 100;
    for (const pitchClasses of scales) {
      let cost = Math.abs(tuning) * 1e-3;
      for (const note of notes) {
        const pitch = note.pitch - tuning;
        let miss = 0.5;
        for (const pc of pitchClasses) {
          const distance = Math.abs(((((pitch - pc) % 12) + 18) % 12) - 6);
          miss = Math.min(miss, distance);
        }
        cost += note.duration * miss * miss;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = tuning;
      }
    }
  }
  return best;
}
