import type { Recording } from "./db";
import { analysisOptionsFor, type AnalysisSettings } from "./recording-profiles";
import { analyzeBuffer } from "./recorder";

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
