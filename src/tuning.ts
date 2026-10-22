// Per-recording tuning: defaults + last-used persistence so new takes inherit it.

import type { SegmentOptions } from "./notes";

export type Tuning = Required<
  Pick<
    SegmentOptions,
    | "hysteresisSemitones"
    | "minDurationSec"
    | "silenceGapSec"
    | "changeDebounceSec"
    | "medianWindow"
    | "clarityThreshold"
    | "rmsGate"
  >
>;

export const DEFAULT_TUNING: Tuning = {
  hysteresisSemitones: 0.4,
  minDurationSec: 0.08,
  silenceGapSec: 0.09,
  changeDebounceSec: 0.06,
  medianWindow: 5,
  clarityThreshold: 0.9,
  rmsGate: 0.003,
};

const KEY = "diapason.lastTuning";

export function loadLastTuning(): Tuning {
  try {
    return {
      ...DEFAULT_TUNING,
      ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Tuning>),
    };
  } catch {
    return { ...DEFAULT_TUNING };
  }
}

export function saveLastTuning(t: Tuning): void {
  localStorage.setItem(KEY, JSON.stringify(t));
}
