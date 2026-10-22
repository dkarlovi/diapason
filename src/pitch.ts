// Monophonic pitch detection via the McLeod Pitch Method (NSDF + parabolic peak).
// Tuned for whistling: a whistle is almost a pure sine, so this stays very stable.
//
// We only evaluate lags inside the whistle's expected frequency band, which both
// slashes CPU cost and rejects the octave/sub-harmonic errors that plague wider ranges.

export interface PitchResult {
  /** Detected fundamental in Hz, or null when the frame is too quiet/unclear to trust. */
  freq: number | null;
  /** NSDF peak value (0..1); how confident/clean the detection is. */
  clarity: number;
  /** RMS level of the frame (0..1); used for gating and level feedback. */
  rms: number;
}

export interface PitchOptions {
  /** Hz; lags below this frequency are ignored. Default 250 (~B3). */
  minFreq?: number;
  /** Hz; lags above this frequency are ignored. Default 4000 (~B7). */
  maxFreq?: number;
  /** NSDF peak required to accept a frame. Default 0.9. */
  clarityThreshold?: number;
}

export const PITCH_DEFAULTS: Required<PitchOptions> = {
  minFreq: 250,
  maxFreq: 3000, // human whistling tops out well below this; capping rejects HF noise latching
  clarityThreshold: 0.9,
};
const DEFAULTS = PITCH_DEFAULTS;

// MPM: accept the first key maximum whose NSDF value is at least this fraction of the
// largest key maximum. Picking the FIRST (shortest period) such peak — not the global
// max — is what prevents octave-down / sub-harmonic errors on near-pure tones.
const KEY_FACTOR = 0.9;

export type PitchDetector = (buf: Float32Array) => PitchResult;

export function createPitchDetector(sampleRate: number, opts: PitchOptions = {}): PitchDetector {
  const cfg = { ...DEFAULTS, ...opts };
  const minLag = Math.max(2, Math.floor(sampleRate / cfg.maxFreq));
  const maxLag = Math.ceil(sampleRate / cfg.minFreq);

  return function detect(buf: Float32Array): PitchResult {
    const n = buf.length;

    let sumSq = 0;
    for (let i = 0; i < n; i++) sumSq += buf[i]! * buf[i]!;
    const rms = Math.sqrt(sumSq / n);

    const hi = Math.min(maxLag, n - 1);
    if (hi <= minLag) return { freq: null, clarity: 0, rms };

    // Normalized Square Difference Function. Computed from tau 0 so the local-maximum
    // test is valid at the low end of the band.
    const nsdf = new Float32Array(hi + 1);
    for (let tau = 0; tau <= hi; tau++) {
      let acf = 0;
      let div = 0;
      for (let i = 0; i < n - tau; i++) {
        acf += buf[i]! * buf[i + tau]!;
        div += buf[i]! * buf[i]! + buf[i + tau]! * buf[i + tau]!;
      }
      nsdf[tau] = div > 0 ? (2 * acf) / div : 0;
    }

    // Collect "key maxima": local maxima of the NSDF within the band. The global best
    // among them sets the acceptance threshold; we then take the FIRST one above it.
    let globalMax = 0;
    for (let tau = minLag; tau < hi; tau++) {
      const v = nsdf[tau]!;
      if (v > 0 && v >= nsdf[tau - 1]! && v >= nsdf[tau + 1]! && v > globalMax) globalMax = v;
    }
    if (globalMax < cfg.clarityThreshold) {
      return { freq: null, clarity: Math.max(0, globalMax), rms };
    }

    const threshold = KEY_FACTOR * globalMax;
    let chosenTau = -1;
    let chosenVal = 0;
    for (let tau = minLag; tau < hi; tau++) {
      const v = nsdf[tau]!;
      if (v > 0 && v >= nsdf[tau - 1]! && v >= nsdf[tau + 1]! && v >= threshold) {
        chosenTau = tau;
        chosenVal = v;
        break;
      }
    }
    if (chosenTau < 0) return { freq: null, clarity: globalMax, rms };

    // Parabolic interpolation around the chosen peak for sub-sample lag precision.
    const t = chosenTau;
    let tau = t;
    const a = nsdf[t - 1]!;
    const b = nsdf[t]!;
    const c = nsdf[t + 1]!;
    const denom = a - 2 * b + c;
    if (denom !== 0) tau = t + (0.5 * (a - c)) / denom;

    return { freq: sampleRate / tau, clarity: chosenVal, rms };
  };
}
