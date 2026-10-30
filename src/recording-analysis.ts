import type { Recording } from "./Recording/Recording.type";
import { analysisOptionsFor } from "./recording-profiles";
import { analyzeBuffer } from "./recorder";
import type { AnalysisSettings } from "./Recording/SoundProfile.type";

/** Resolve only acoustic settings. A scheduled metronome is not microphone evidence. */
export function resolveAnalysisOptions(record: Pick<Recording, "source">): AnalysisSettings {
  return { ...analysisOptionsFor(record) };
}

export function analyzeRecording(
  pcm: Float32Array,
  sampleRate: number,
  record: Pick<Recording, "source">,
) {
  return analyzeBuffer(pcm, sampleRate, resolveAnalysisOptions(record));
}
