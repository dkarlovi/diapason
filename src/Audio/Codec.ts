// Audio sample conversion + lossless gzip compression (browser-native, no deps).
// Recordings are stored as gzipped Int16 PCM: half the size of Float32, losslessly packed.

import { floatToPcm16, pcm16ToFloat } from "./Pcm";

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
  return gzip(floatToPcm16(pcm).buffer as ArrayBuffer);
}

/** Gzipped Int16 Blob -> Float32 PCM for analysis/playback. */
export async function decodeAudio(blob: Blob): Promise<Float32Array<ArrayBuffer>> {
  return pcm16ToFloat(new Int16Array(await gunzip(blob)));
}
