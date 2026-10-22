// Audio sample conversion + lossless gzip compression (browser-native, no deps).
// Takes are stored as gzipped Int16 PCM: half the size of Float32, losslessly packed.

function floatToInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToFloat(i16: Int16Array): Float32Array<ArrayBuffer> {
  const out = new Float32Array(i16.length) as Float32Array<ArrayBuffer>;
  for (let i = 0; i < i16.length; i++) out[i] = i16[i]! / 32768;
  return out;
}

async function gzip(data: ArrayBuffer): Promise<Blob> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

async function gunzip(blob: Blob): Promise<ArrayBuffer> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

/** Float32 PCM -> gzipped Int16 Blob for storage. */
export async function encodeAudio(pcm: Float32Array): Promise<Blob> {
  return gzip(floatToInt16(pcm).buffer as ArrayBuffer);
}

/** Gzipped Int16 Blob -> Float32 PCM for analysis/playback. */
export async function decodeAudio(blob: Blob): Promise<Float32Array<ArrayBuffer>> {
  return int16ToFloat(new Int16Array(await gunzip(blob)));
}
