/** Detect transient onsets in contiguous, non-overlapping post-gain PCM blocks. */
export function createClapDetector(sampleRate: number, noiseFloor: number) {
  const windowSize = Math.max(1, Math.round(sampleRate * 0.01));
  const threshold = Math.max(0.015, noiseFloor * 4);
  let sum = 0,
    peak = 0,
    count = 0,
    windowStart = 0,
    expected = -Infinity;
  let armed = true,
    lastClap = -Infinity;
  const reset = () => {
    sum = 0;
    peak = 0;
    count = 0;
    armed = true;
    lastClap = -Infinity;
    expected = -Infinity;
  };
  return {
    reset,
    process(samples: Float32Array, startSec: number): number[] {
      if (!Number.isFinite(startSec) || !Number.isFinite(sampleRate) || sampleRate <= 0) return [];
      if (expected !== -Infinity && Math.abs(startSec - expected) > 2 / sampleRate) reset();
      const events: number[] = [];
      for (let i = 0; i < samples.length; i++) {
        if (count === 0) windowStart = startSec + i / sampleRate;
        const value = samples[i]!;
        sum += value * value;
        peak = Math.max(peak, Math.abs(value));
        count++;
        if (count < windowSize) continue;
        const rms = Math.sqrt(sum / count);
        if (rms <= threshold / 2) armed = true;
        if (armed && rms >= threshold && peak / rms >= 2 && windowStart - lastClap >= 0.15) {
          events.push(windowStart);
          lastClap = windowStart;
          armed = false;
        }
        sum = 0;
        peak = 0;
        count = 0;
      }
      expected = startSec + samples.length / sampleRate;
      return events;
    },
  };
}
