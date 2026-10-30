/** Canonical signed PCM16 conversion; decoded storage samples round-trip exactly. */
export function floatToPcm16(samples: Float32Array): Int16Array<ArrayBuffer> {
  return Int16Array.from(samples, (sample) =>
    Math.max(-32768, Math.min(32767, Math.trunc(sample * 32768))),
  );
}

export function pcm16ToFloat(samples: Int16Array): Float32Array<ArrayBuffer> {
  return Float32Array.from(samples, (sample) => sample / 32768);
}
