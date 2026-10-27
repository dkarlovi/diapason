import type { Recording } from "./db";
import type { AnalyzeOptions } from "./recorder";
import type { PitchRange } from "./pitch";
import { isPitchRange } from "./voice-range";

export type AnalysisSettings = Required<
  Pick<AnalyzeOptions, "windowSize" | "hop" | "minFreq" | "maxFreq" | "clarityThreshold">
> & { preferredRange?: PitchRange };

export interface SoundProfile {
  id: string;
  label: string;
  instruction: string;
  analysis: AnalysisSettings;
  checks: { voicedRatio: number; clarity: number; noiseRatio: number };
}
export const SOUND_PROFILES: readonly SoundProfile[] = [
  {
    id: "whistle",
    label: "Whistling",
    instruction: "Whistle a steady note at your normal volume.",
    analysis: { windowSize: 2048, hop: 512, minFreq: 250, maxFreq: 3000, clarityThreshold: 0.9 },
    checks: { voicedRatio: 0.25, clarity: 0.9, noiseRatio: 3 },
  },
  {
    id: "voice-experimental",
    label: "Singing / humming (experimental)",
    instruction: "Sing or hum a steady note at your normal volume.",
    analysis: { windowSize: 4096, hop: 512, minFreq: 65, maxFreq: 1500, clarityThreshold: 0.8 },
    checks: { voicedRatio: 0.25, clarity: 0.8, noiseRatio: 3 },
  },
];
export function getSoundProfile(id: string): SoundProfile {
  return SOUND_PROFILES.find((profile) => profile.id === id) ?? SOUND_PROFILES[0]!;
}
export function analysisOptionsFor(record: Pick<Recording, "source">): SoundProfile["analysis"] {
  const source = record.source;
  const defaults = getSoundProfile("whistle").analysis;
  if (!source || !SOUND_PROFILES.some((p) => p.id === source.profileId)) return defaults;
  const a = source.analysis;
  if (
    !a ||
    ![a.minFreq, a.maxFreq, a.clarityThreshold, a.windowSize, a.hop].every(Number.isFinite) ||
    (a.preferredRange !== undefined && !isPitchRange(a.preferredRange, a)) ||
    a.minFreq <= 0 ||
    a.maxFreq <= a.minFreq ||
    a.maxFreq > 20000 ||
    a.clarityThreshold <= 0 ||
    a.clarityThreshold > 1 ||
    !Number.isInteger(a.windowSize) ||
    a.windowSize < 256 ||
    a.windowSize > 32768 ||
    (a.windowSize & (a.windowSize - 1)) !== 0 ||
    !Number.isInteger(a.hop) ||
    a.hop < 1 ||
    a.hop > a.windowSize
  )
    return defaults;
  return a;
}
