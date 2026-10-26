import { pcm16ToFloat } from "./pcm";

function readFormat(view: DataView, start: number, length: number) {
  if (
    length < 16 ||
    view.getUint16(start, true) !== 1 ||
    view.getUint16(start + 2, true) !== 1 ||
    view.getUint16(start + 14, true) !== 16
  ) {
    throw new Error("Diagnostics require mono PCM16 WAV.");
  }
  return view.getUint32(start + 4, true);
}

function readSamples(view: DataView, start: number, length: number) {
  if (length % 2) throw new Error("Invalid PCM16 WAV data length.");
  return Int16Array.from({ length: length / 2 }, (_, index) =>
    view.getInt16(start + index * 2, true),
  );
}

function wavView(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  const tag = (offset: number) => String.fromCharCode(...new Uint8Array(bytes, offset, 4));
  if (
    bytes.byteLength < 44 ||
    tag(0) !== "RIFF" ||
    tag(8) !== "WAVE" ||
    view.getUint32(4, true) + 8 !== bytes.byteLength
  ) {
    throw new Error("Invalid WAV container.");
  }
  return { view, tag };
}

/** Walk the RIFF chunks, allowing ordinary padded chunks. */
export function wavChunks(bytes: ArrayBuffer) {
  const { view, tag } = wavView(bytes);
  const chunks: { id: string; start: number; length: number }[] = [];
  for (let offset = 12; offset + 8 <= bytes.byteLength;) {
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + length > bytes.byteLength) throw new Error("Truncated WAV chunk.");
    chunks.push({ id: tag(offset), start, length });
    offset = start + length + (length % 2);
  }
  return chunks;
}

/** Decode diagnostic WAVs, while allowing ordinary padded RIFF chunks. */
export function decodeWav(bytes: ArrayBuffer) {
  const view = new DataView(bytes);
  let sampleRate = 0;
  let data: Int16Array | undefined;
  for (const { id, start, length } of wavChunks(bytes)) {
    if (id === "fmt ") sampleRate = readFormat(view, start, length);
    if (id === "data") data = readSamples(view, start, length);
  }
  if (!sampleRate || !data) throw new Error("WAV is missing format or sample data.");
  return { sampleRate, pcm: pcm16ToFloat(data) };
}
