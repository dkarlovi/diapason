import type { PitchPoint } from "./PitchCurve.type";
import type { Key } from "./Key";
import type { SourceRange } from "../Editing/NoteEdits.type";

export interface PitchContext {
  key: Key | null;
  harmony: { start: number; end: number; pitchClasses: ReadonlySet<number> }[];
  range: { minMidi: number; maxMidi: number };
  /** Performer's tuning relative to A440, in semitones; subtracted before labelling. */
  tuning: number;
  /** Beat length and the performance's lag behind the click, in seconds. */
  meter: { beat: number; lag: number } | null;
}

export type InterpretationVersion = 1 | 2 | 3 | 4;

/** One performed note, in seconds, with an optional pitch contour. */
export interface Segment {
  curve?: PitchPoint[];
  source: SourceRange;
  start: number;
  duration: number;
  pitch: number;
}
