import type { Segment } from "../Melody/Decode.type";
import type { Knobs, DETECTION_KNOBS } from "../Melody/Knobs";

export interface NoteSource {
  version: 1;
  interpretationVersion: 1 | 2;
  segments: Segment[];
  range: { minMidi: number; maxMidi: number };
  frozenDetection: Pick<Knobs, (typeof DETECTION_KNOBS)[number]>;
}
