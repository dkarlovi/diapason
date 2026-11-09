import type { Segment } from "../Melody/Decode.type";
import type { PitchPoint } from "../Melody/PitchCurve.type";

export interface SourceRange {
  start: number;
  end: number;
}

export interface PitchEdit {
  id: string;
  ranges: SourceRange[];
  midi: number;
}

export interface NoteEdits {
  version: 1;
  pitch: PitchEdit[];
  bend?: BendEdit[];
}

export interface PitchEditCoverage {
  id: string;
  status: "active" | "partial" | "inactive";
  missing: SourceRange[];
}

export interface BendEdit {
  id: string;
  segment: Segment;
  points: PitchPoint[];
}
