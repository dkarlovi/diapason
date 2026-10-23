import type { Recording } from "./db";
import { DEFAULT_TUNING } from "./tuning";
import { DEFAULT_PLAY } from "./instruments";
import { analysisOptionsFor } from "./recording-profiles";

/** Missing quantization on older recordings historically meant enabled eighth notes. */
export const DEFAULT_QUANTIZE = { on: true, subdivision: 2 };

export function resolveRecordingSettings(record: Recording) {
  return {
    tuning: { ...DEFAULT_TUNING, ...record.tuning },
    quantize: { ...(record.quantize ?? DEFAULT_QUANTIZE) },
    play: { ...DEFAULT_PLAY, ...record.play },
    bpm: record.bpm,
    beatsPerBar: record.beatsPerBar,
    midi: { ppq: 480, velocity: 96, microsecondsPerQuarter: Math.round(60000000 / record.bpm) },
    origins: {
      quantize: record.quantize ? "saved" : "legacy-default",
      play: record.play ? "saved" : "default",
      analysis:
        record.source && analysisOptionsFor(record) === record.source.analysis
          ? "saved"
          : "profile-default",
      tuning: Object.fromEntries(
        Object.keys(DEFAULT_TUNING).map((key) => [key, key in record.tuning ? "saved" : "default"]),
      ),
    },
  };
}
