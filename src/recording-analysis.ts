import type { Recording } from "./db";
import { analysisOptionsFor } from "./recording-profiles";
import { analyzeBuffer, type AnalyzeOptions } from "./recorder";

/** Resolve only acoustic settings. A scheduled metronome is not microphone evidence. */
export function resolveAnalysisOptions(
  record: Pick<Recording, "source">,
): Required<AnalyzeOptions> {
  return { ...analysisOptionsFor(record) };
}

export function analyzeRecording(
  pcm: Float32Array,
  sampleRate: number,
  record: Pick<Recording, "source">,
) {
  return analyzeBuffer(pcm, sampleRate, resolveAnalysisOptions(record));
}
