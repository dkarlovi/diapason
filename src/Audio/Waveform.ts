/** Linear RMS amplitudes covering the original audio from beginning to end. */
export interface WaveformSummary {
  version: 1;
  rms: Float32Array;
}

export function summarizeWaveform(pcm: Float32Array): WaveformSummary {
  const count = Math.min(128, pcm.length);
  const rms = new Float32Array(count);
  for (let bucket = 0; bucket < count; bucket++) {
    const start = Math.floor((bucket * pcm.length) / count);
    const end = Math.floor(((bucket + 1) * pcm.length) / count);
    let energy = 0;
    for (let i = start; i < end; i++) energy += pcm[i]! ** 2;
    rms[bucket] = Math.sqrt(energy / (end - start));
  }
  return { version: 1, rms };
}

/** Pool adjacent buckets by energy, including fractional edge contributions. */
export function waveformBars(summary: WaveformSummary, count = 44): number[] {
  const values = summary.rms;
  const bars = Array.from({ length: count }, (_, bar) => {
    if (!values.length) return 0;
    const start = (bar * values.length) / count;
    const end = ((bar + 1) * values.length) / count;
    let energy = 0;
    for (let i = Math.floor(start); i < Math.ceil(end); i++) {
      const weight = Math.min(end, i + 1) - Math.max(start, i);
      energy += values[i]! ** 2 * weight;
    }
    return Math.sqrt(energy / (end - start));
  });
  const peak = Math.max(0, ...bars);
  return bars.map((value) => (peak > 0.000001 ? value / peak : 0));
}
