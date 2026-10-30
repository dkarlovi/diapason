import type { PlaySettings } from "../Playback/Instruments";
import type { ChordSpan } from "../Melody/Harmony";
import type { Interpretation } from "../Melody/Interpret";
import type { MelodySetting } from "../Melody/MelodySetting.type";
import type { PitchEditCoverage } from "../Editing/NoteEdits";
import type { NoteEvent } from "../Melody/Notes";
import type { QualityStats } from "../Audio/Recorder";
import type { NoteItem } from "./NoteItem.type";
import type { AnalysisSettings } from "./SoundProfile.type";

/** Effective settings a recording is processed with, and which source supplied each. */
export interface RecordingSettings {
  melody: MelodySetting;
  play: PlaySettings;
  bpm: number;
  beatsPerBar: number;
  midi: { ppq: number; velocity: number; microsecondsPerQuarter: number };
  origins: { melody: string; play: string; analysis: string };
}

/** Pipeline output a recording package stores so a later build can compare its own replay. */
export interface ProcessingEvidence {
  settings: RecordingSettings;
  analysis: AnalysisSettings & { masking: string };
  stages: Omit<Interpretation, "harmony"> & {
    harmony: (Omit<ChordSpan, "pitchClasses"> & { pitchClasses: number[] })[];
    editCoverage: PitchEditCoverage[];
    items: NoteItem[];
    notes: NoteEvent[];
  };
  config: {
    sampleRate: number;
    durationSec: number;
    windowSize: number;
    hop: number;
    minFreq: number;
    maxFreq: number;
    clarityThreshold: number;
    rmsGate: number;
  };
  quality: QualityStats;
  notes: NoteEvent[];
}
