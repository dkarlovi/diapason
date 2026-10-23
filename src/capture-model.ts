import type { Frame } from "./notes";
import type { SoundProfile } from "./recording-profiles";
import type { SetupCheck, RoomResult, MeasurementResult } from "./recording-setup";
import { qualityStats } from "./recorder";

export interface DspCheck {
  name: string;
  off: boolean;
  known: boolean;
}

export function dspStatus(settings: MediaTrackSettings): DspCheck[] {
  return (["echoCancellation", "noiseSuppression", "autoGainControl"] as const).map((name) => ({
    name,
    off: settings[name] === false,
    known: typeof settings[name] === "boolean",
  }));
}

/**
 * Seconds between a click being scheduled and the performer's answer to it
 * arriving in the recording: output (click to ears) plus input (mic to us), as
 * far as the browser reports them. Missing figures count as zero.
 */
export function roundTripLatency(
  context: { baseLatency?: number; outputLatency?: number },
  track: MediaTrackSettings & { latency?: number },
): number {
  const seconds = [context.baseLatency, context.outputLatency, track.latency].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  return Math.min(
    1,
    seconds.reduce((sum, value) => sum + value, 0),
  );
}

export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

export function noiseCalibration(samples: number[]): { floor: number; gate: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return { floor, gate: Math.min(0.1, Math.max(0.003, floor * 1.5)) };
}

export function trimCountIn(
  pcm: Float32Array,
  downbeat: number,
  start: number,
  sampleRate: number,
): Float32Array {
  const drop = Math.min(pcm.length, Math.max(0, Math.round((downbeat - start) * sampleRate)));
  return pcm.slice(drop);
}

export function levelHint(peak: number): string {
  if (peak > 0.98) return "⚠ Clipping — lower Input gain or move back.";
  if (peak < 0.08) return "Signal is low — raise Input gain or move closer.";
  return "Good level — whistle a steady note.";
}

export const CALIBRATION = {
  roomMs: 1500,
  soundMs: 2000,
  roomMinSamples: 10,
  roomMinSpan: 1.2,
  soundMinSpan: 1.5,
  maxFloor: 0.01,
  clipPeak: 0.98,
} as const;
export function setupCheck(
  id: string,
  label: string,
  pass: boolean,
  detail: string,
  blocking = true,
): SetupCheck {
  return { id, label, status: pass ? "passed" : "attention", detail, blocking };
}
function hasCoverage(times: number[], minCount: number, minSpan: number): boolean {
  return (
    times.length >= minCount &&
    times.at(-1)! - times[0]! >= minSpan &&
    times.every(
      (time, index) =>
        index === 0 || (time > times[index - 1]! && time - times[index - 1]! <= 0.25),
    )
  );
}
export function evaluateRoom(samples: Array<{ t: number; rms: number; peak: number }>): RoomResult {
  const valid = samples.filter(
    (s) =>
      Number.isFinite(s.t) &&
      Number.isFinite(s.rms) &&
      Number.isFinite(s.peak) &&
      s.rms >= 0 &&
      s.peak >= 0,
  );
  const enough =
    valid.length === samples.length &&
    hasCoverage(
      valid.map((s) => s.t),
      CALIBRATION.roomMinSamples,
      CALIBRATION.roomMinSpan,
    );
  const { floor, gate } = noiseCalibration(valid.map((s) => s.rms));
  const checks = [
    setupCheck(
      "room-samples",
      "Room measurement captured",
      enough,
      enough ? "Silence sampled" : "Not enough audio — measure again",
    ),
    setupCheck(
      "room-quiet",
      "Low room noise",
      enough && floor <= CALIBRATION.maxFloor,
      enough
        ? floor <= CALIBRATION.maxFloor
          ? "Quiet enough"
          : "Move somewhere quieter, then retry"
        : "Waiting for a valid measurement",
    ),
    setupCheck(
      "room-clipping",
      "No clipping",
      enough && valid.every((s) => s.peak < CALIBRATION.clipPeak),
      enough ? "Room sample checked" : "Not checked",
    ),
  ];
  return { floor, gate, checks, pass: checks.every((c) => c.status === "passed") };
}
export function evaluateSound(
  frames: Frame[],
  peak: number,
  floor: number,
  profile: SoundProfile,
): MeasurementResult {
  const valid = frames.filter(
    (f) =>
      Number.isFinite(f.t) &&
      Number.isFinite(f.rms) &&
      f.rms >= 0 &&
      Number.isFinite(f.clarity) &&
      (f.freq === null || (Number.isFinite(f.freq) && f.freq > 0)),
  );
  const enough =
    valid.length === frames.length &&
    hasCoverage(
      valid.map((f) => f.t),
      10,
      CALIBRATION.soundMinSpan,
    );
  const stats = qualityStats(valid);
  const voicedRms = valid
    .filter((f) => f.freq !== null)
    .map((f) => f.rms)
    .sort((a, b) => a - b);
  const rms = voicedRms[Math.floor(voicedRms.length / 2)] ?? 0;
  const checks = [
    setupCheck(
      "sound-samples",
      "Sound measurement captured",
      enough,
      enough ? "Test captured" : "Not enough audio — try again",
    ),
    setupCheck(
      "sound-pitch",
      "Pitch detected",
      enough && stats.voicedRatio >= profile.checks.voicedRatio,
      `${Math.round(stats.voicedRatio * 100)}% detected`,
    ),
    setupCheck(
      "sound-clear",
      "Clear tone",
      enough && stats.medianClarity >= profile.checks.clarity,
      "Use your normal volume",
    ),
    setupCheck(
      "sound-clipping",
      "No clipping",
      enough && Number.isFinite(peak) && peak < CALIBRATION.clipPeak,
      peak >= CALIBRATION.clipPeak ? "Lower gain or move back" : "Level checked",
    ),
    setupCheck(
      "sound-noise",
      "Sound above room noise",
      enough &&
        Number.isFinite(floor) &&
        floor >= 0 &&
        rms >= Math.max(0.003, floor * profile.checks.noiseRatio),
      "Your sound should stand out from the background",
    ),
    setupCheck(
      "sound-steady",
      "Steady pitch",
      enough && stats.centsStd <= 20,
      "Optional — steadier notes are easier to transcribe",
      false,
    ),
  ];
  return { checks, pass: checks.every((c) => !c.blocking || c.status === "passed") };
}
