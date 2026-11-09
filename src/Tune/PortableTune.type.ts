import type { PlaySettings } from "../Playback/Instruments";
import type { Knobs } from "../Melody/Knobs";
import type { MelodySetting } from "../Melody/MelodySetting.type";
import type { NoteSource } from "../Recording/NoteSource.type";
import type { PitchPoint } from "../Melody/PitchCurve.type";

export interface PortableTune {
  schemaVersion: 1;
  name: string;
  durationMs: number;
  bpm: number;
  beatsPerBar: number;
  noteSource: NoteSource;
  melody: MelodySetting;
  effectiveKnobs: Knobs;
  play: PlaySettings;
  pitchEdits: { noteIndex: number; midi: number }[];
  bendEdits?: { noteIndex: number; points: PitchPoint[] }[];
  mutedIndices: number[];
}
