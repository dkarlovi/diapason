interface ContourRegion {
  frames: number;
  rms?: number;
}

export type ContourPart = ContourRegion &
  (
    | { kind: "hold"; midi: number }
    | { kind: "linear"; from: number; to: number }
    | { kind: "vibrato"; midi: number; amplitude: number; hz: number }
    | { kind: "silence" }
  );

export interface ContourNote {
  startFrame: number;
  endFrame: number;
  pitch: number;
}

export interface ContourCase {
  id: string;
  provenance: string;
  parts: ContourPart[];
  intent: {
    review: "synthetic" | "unreviewed";
    boundaries: "exact" | "contains";
    notes: ContourNote[] | null;
  };
  observations: {
    steadiness: number;
    segments: ContourNote[];
    intent: "matches" | "differs" | "unreviewed";
  }[];
}
