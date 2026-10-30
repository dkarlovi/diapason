import type { Segment } from "../melody/Decode.type";
import type { Knobs, DETECTION_KNOBS } from "../melody/knobs";

export interface NoteSource {
  version: 1;
  interpretationVersion: 1 | 2;
  segments: Segment[];
  range: { minMidi: number; maxMidi: number };
  frozenDetection: Pick<Knobs, (typeof DETECTION_KNOBS)[number]>;
}
