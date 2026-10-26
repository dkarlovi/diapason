import { floatToPcm16 } from "./pcm";

// Encodes mono Float32 PCM to a 16-bit WAV Blob — the most universally readable
// format for offline inspection (scipy, Audacity, ffmpeg, etc.). 16-bit is plenty
// for whistle analysis; the signal is near-sine and well above the noise floor.

/** An extra RIFF chunk; `id` is exactly four ASCII characters. */
export interface WavChunk {
  id: string;
  data: Uint8Array;
}

/** Extra chunks follow `data`, so the first 44 bytes keep the plain layout. */
export function wavBytes(
  samples: Float32Array,
  sampleRate: number,
  extra: readonly WavChunk[] = [],
): ArrayBuffer {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const extraSize = extra.reduce(
    (size, chunk) => size + 8 + chunk.data.length + (chunk.data.length % 2),
    0,
  );
  const buffer = new ArrayBuffer(44 + dataSize + extraSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  // RIFF header
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize + extraSize, true);
  writeStr(8, "WAVE");
  // fmt chunk
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const integers = floatToPcm16(samples);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    view.setInt16(offset, integers[i]!, true);
    offset += 2;
  }
  // Odd-length chunks get a zero pad byte that their size does not count.
  for (const chunk of extra) {
    writeStr(offset, chunk.id);
    view.setUint32(offset + 4, chunk.data.length, true);
    new Uint8Array(buffer, offset + 8, chunk.data.length).set(chunk.data);
    offset += 8 + chunk.data.length + (chunk.data.length % 2);
  }

  return buffer;
}

export function encodeWav(
  samples: Float32Array,
  sampleRate: number,
  extra?: readonly WavChunk[],
): Blob {
  return new Blob([wavBytes(samples, sampleRate, extra)], { type: "audio/wav" });
}
