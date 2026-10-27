import { evaluateSound, setupCheck } from "./capture-model";
import { freqToMidi, midiToName, type Frame } from "./notes";
import type { PitchRange } from "./pitch";
import type { SoundProfile } from "./recording-profiles";
import type { MeasurementResult } from "./recording-setup";

export interface EndpointResult extends MeasurementResult {
  frequency: number | null;
}

/** Require a mostly held pitch; isolated octave glitches cannot define an endpoint. */
export function measureVoiceEndpoint(
  frames: Frame[],
  peak: number,
  floor: number,
  profile: SoundProfile,
): EndpointResult {
  const result = evaluateSound(frames, peak, floor, profile);
  const frequencies = frames
    .filter(
      (f) =>
        f.freq !== null &&
        f.clarity >= profile.checks.clarity &&
        f.rms >= Math.max(0.003, floor * profile.checks.noiseRatio),
    )
    .map((f) => f.freq!)
    .filter(
      (f) => Number.isFinite(f) && f >= profile.analysis.minFreq && f <= profile.analysis.maxFreq,
    )
    .sort((a, b) => a - b);
  const median = frequencies[Math.floor(frequencies.length / 2)] ?? 0;
  const near = frequencies.filter((f) => Math.abs(1200 * Math.log2(f / median)) <= 50);
  const steady = frequencies.length >= 10 && near.length / frequencies.length >= 0.8;
  const checks = [
    ...result.checks.filter((check) => check.id !== "sound-steady"),
    setupCheck(
      "range-steady",
      "Held note captured",
      steady,
      steady ? pitchLabel(median) : "Hold one comfortable note, then try again",
    ),
  ];
  return { checks, pass: result.pass && steady, frequency: result.pass && steady ? median : null };
}

export function voiceRange(low: number, high: number, band: PitchRange): PitchRange | null {
  if (
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    low < band.minFreq ||
    high > band.maxFreq ||
    low >= high
  )
    return null;
  return {
    minFreq: Math.max(band.minFreq, low / 2 ** 0.25),
    maxFreq: Math.min(band.maxFreq, high * 2 ** 0.25),
  };
}

export function isPitchRange(value: unknown, band: PitchRange): value is PitchRange {
  if (!value || typeof value !== "object") return false;
  const range = value as PitchRange;
  return (
    Number.isFinite(range.minFreq) &&
    Number.isFinite(range.maxFreq) &&
    range.minFreq >= band.minFreq &&
    range.maxFreq <= band.maxFreq &&
    range.minFreq < range.maxFreq
  );
}

export function pitchLabel(frequency: number): string {
  return `${midiToName(Math.round(freqToMidi(frequency)))} (${Math.round(frequency)} Hz)`;
}

export function rangeLabel(range: PitchRange): string {
  return `${pitchLabel(range.minFreq)} – ${pitchLabel(range.maxFreq)}`;
}
