import type { NoteRecording } from "../../src/Recording/Recording.type";
import { PRESETS } from "../../src/Melody/Knobs";
const knobs = PRESETS["as-played"].knobs;
const fixed: NoteRecording = {
  id: "fixed",
  name: "Shared",
  createdAt: 1,
  durationSec: 2,
  bpm: 120,
  beatsPerBar: 4,
  play: { instrument: "flute", octave: -2 },
  melody: { preset: "as-played", overrides: {}, key: "auto" },
  noteSource: {
    version: 1,
    interpretationVersion: 1,
    range: { minMidi: 48, maxMidi: 96 },
    frozenDetection: {
      steadiness: knobs.steadiness,
      minNoteMs: knobs.minNoteMs,
      silenceGapMs: knobs.silenceGapMs,
      levelGate: knobs.levelGate,
    },
    segments: [
      { source: { start: 0, end: 0.5 }, start: 0, duration: 0.5, pitch: 72 },
      { source: { start: 0.5, end: 1 }, start: 0.5, duration: 0.5, pitch: 74 },
    ],
  },
};

export function noteRecording(): NoteRecording {
  return structuredClone(fixed);
}
