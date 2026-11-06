export function upperMedianInPlace(samples: number[]): number {
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}
