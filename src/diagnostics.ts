import { midiEvents } from "./midi";
// Shared structured processing evidence for recording packages and CLI replay.
// Schema-4 fields also support legacy paired JSON/WAV regression fixtures.

import { freqToMidi, type Frame } from "./notes";
import type { AudioRecording as Recording } from "./Recording/Recording.type";
import { processRecording } from "./recording";
import { resolveAnalysisOptions } from "./recording-analysis";
import { BUILD_INFO } from "./build-info";
import type { QualityStats } from "./recorder";

export const SCHEMA_VERSION = 4;

export interface ReportInput {
  recording: Recording;
  context?: { browser: string; audioOutput: string; midiOutput: string };
  title: string;
  sampleRate: number;
  durationSec: number;
  windowSize: number;
  hop: number;
  detector: { minFreq: number; maxFreq: number; clarityThreshold: number };
  rmsGate: number;
  frames: Frame[];
  stats: QualityStats;
}

interface FrameRow {
  t: number;
  tMs: number;
  freq: number | null;
  midi: number | null;
  cents: number | null;
  clarity: number;
  rms: number;
}

export function buildReportData(input: ReportInput) {
  const processed = processRecording(input.recording, input.frames);
  const stages = {
    ...processed.interpretation,
    harmony: processed.interpretation.harmony.map((chord) => ({
      ...chord,
      pitchClasses: [...chord.pitchClasses],
    })),
    editCoverage: processed.editCoverage,
    items: processed.items,
    notes: processed.notes,
  };
  const notes = processed.notes;
  const frames: FrameRow[] = input.frames.map((f) => {
    if (f.freq === null) {
      return {
        t: f.t,
        tMs: f.t * 1000,
        freq: null,
        midi: null,
        cents: null,
        clarity: f.clarity,
        rms: f.rms,
      };
    }
    const midi = freqToMidi(f.freq);
    return {
      t: f.t,
      tMs: f.t * 1000,
      freq: f.freq,
      midi: Math.round(midi * 100) / 100,
      cents: Math.round((midi - Math.round(midi)) * 100),
      clarity: f.clarity,
      rms: f.rms,
    };
  });

  return {
    app: "diapason",
    schemaVersion: SCHEMA_VERSION,
    build: BUILD_INFO,
    saved: { ...input.recording, audio: undefined },
    context: input.context ?? { browser: "unknown", audioOutput: "unknown", midiOutput: "unknown" },
    settings: processed.settings,
    analysis: { ...resolveAnalysisOptions(input.recording), masking: "none" },
    stages,
    midiEvents: midiEvents(notes, { bpm: input.recording.bpm }),
    playback: {
      octaveAffectsExport: false,
      instrumentAffectsExport: false,
      externalNoteOffLeadMs: 5,
    },
    title: input.title,
    generated: new Date().toISOString(),
    config: {
      sampleRate: input.sampleRate,
      durationSec: input.durationSec,
      windowSize: input.windowSize,
      hop: input.hop,
      minFreq: input.detector.minFreq,
      maxFreq: input.detector.maxFreq,
      clarityThreshold: input.detector.clarityThreshold,
      rmsGate: input.rmsGate,
    },
    quality: input.stats,
    notes,
    frames,
  };
}
