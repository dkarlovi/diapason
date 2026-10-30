import type { PitchRange } from "../pitch";
import type { AnalyzeOptions } from "../recorder";

export interface SoundProfile {
  id: string;
  label: string;
  instruction: string;
  analysis: AnalysisSettings;
  checks: { voicedRatio: number; clarity: number; noiseRatio: number };
}

export type AnalysisSettings = Required<
  Pick<AnalyzeOptions, "windowSize" | "hop" | "minFreq" | "maxFreq" | "clarityThreshold">
> & { preferredRange?: PitchRange };
