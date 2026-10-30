import type { NoteEvent } from "./Notes";
import type { Key } from "./Key";
export type HarmonyRate = "bar" | "half-bar" | "beat";
export interface ChordSpan {
  start: number;
  end: number;
  root: number;
  quality: "maj" | "min" | "dim";
  pitchClasses: ReadonlySet<number>;
}
function chordsFor(key: Key) {
  const scale = key.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return scale.map((root, degree) => {
    const triad = [root, scale[(degree + 2) % 7]!, scale[(degree + 4) % 7]!];
    if (key.mode === "minor" && degree === 4) triad[1] = 11;
    const third = (triad[1]! - root + 12) % 12;
    const fifth = (triad[2]! - root + 12) % 12;
    const quality: ChordSpan["quality"] = fifth === 6 ? "dim" : third === 4 ? "maj" : "min";
    return {
      root: (key.tonic + root) % 12,
      quality,
      pitchClasses: new Set(triad.map((pitch) => (key.tonic + pitch) % 12)),
    };
  });
}
export function inferHarmony(
  notes: NoteEvent[],
  key: Key,
  timing: { bpm: number; beatsPerBar: number },
  rate: HarmonyRate,
): ChordSpan[] {
  if (!notes.length) return [];
  const step =
    (60 / timing.bpm) * (rate === "beat" ? 1 : timing.beatsPerBar / (rate === "half-bar" ? 2 : 1));
  if (!(step > 0) || !Number.isFinite(step)) return [];
  const candidates = chordsFor(key);
  const end = Math.max(...notes.map((note) => note.start + note.duration));
  const first = Math.floor(Math.min(...notes.map((note) => note.start)) / step);
  const spans: ChordSpan[] = [];
  let previous = -1;
  for (let index = first; index * step < end; index++) {
    const start = index * step;
    const stop = (index + 1) * step;
    let winner = 0;
    let best = -Infinity;
    candidates.forEach((chord, degree) => {
      let score = (degree === previous ? 0.1 : 0) + (degree === 0 ? 0.05 : 0);
      for (const note of notes)
        if (chord.pitchClasses.has(((note.midi % 12) + 12) % 12))
          score += Math.max(
            0,
            Math.min(stop, note.start + note.duration) - Math.max(start, note.start),
          );
      if (score > best) {
        best = score;
        winner = degree;
      }
    });
    spans.push({ start, end: stop, ...candidates[winner]! });
    previous = winner;
  }
  return spans;
}
