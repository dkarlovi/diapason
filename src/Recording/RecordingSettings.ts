import type { RecordingSettings } from "./ProcessingEvidence.type";
import type { Recording } from "./Recording.type";
import { DEFAULT_PLAY } from "../Playback/Instruments";
import { analysisOptionsFor } from "./RecordingProfiles";
import { melodySettingFor } from "../Melody/Settings";
export function resolveRecordingSettings(record: Recording): RecordingSettings {
  return {
    melody: melodySettingFor(record),
    play: { ...DEFAULT_PLAY, ...record.play },
    bpm: record.bpm,
    beatsPerBar: record.beatsPerBar,
    midi: { ppq: 480, velocity: 96, microsecondsPerQuarter: Math.round(60000000 / record.bpm) },
    origins: {
      melody: record.melody ? "saved" : "legacy-default",
      play: record.play ? "saved" : "default",
      analysis:
        record.source && analysisOptionsFor(record) === record.source.analysis
          ? "saved"
          : "profile-default",
    },
  };
}
