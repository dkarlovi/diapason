import { fromBase64Url as decodeBase64Url } from "../Encoding/Base64Url";
export { toBase64Url } from "../Encoding/Base64Url";
import { recordingFromPortableTune } from "./PortableTune";
import { processRecording } from "../Recording/Processing";
import { requireTune } from "./Tune.validation";
import { TUNE_LIMITS } from "./PortableTune";
import { packTune, unpackTune } from "./TuneFields";
import type { PortableTune } from "./PortableTune.type";

const MAGIC = [68, 80, 83, 78, 1]; // DPSN, schema; interpretation version follows.
async function transform(bytes: Uint8Array, compressed: boolean): Promise<Uint8Array> {
  const stream = new Response(new Uint8Array(bytes).buffer).body!.pipeThrough(
    compressed ? new CompressionStream("gzip") : new DecompressionStream("gzip"),
  );
  const reader = stream.getReader(),
    parts: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > TUNE_LIMITS.decoded) throw new Error("Tune data is too large");
      parts.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
function verifyPackedMelody(expected: PortableTune, decoded: PortableTune) {
  const before = processRecording(recordingFromPortableTune(expected, "before", 0), []);
  const after = processRecording(recordingFromPortableTune(decoded, "after", 0), []);
  requireTune(before.items.length === after.items.length);
  requireTune(
    JSON.stringify(before.interpretation.key.chosen) ===
      JSON.stringify(after.interpretation.key.chosen),
  );
  requireTune(before.items.every((item, i) => samePackedNote(item, after.items[i]!)));
}
function samePackedNote(
  a: ReturnType<typeof processRecording>["items"][number],
  b: ReturnType<typeof processRecording>["items"][number],
): boolean {
  return (
    a.automatic.midi === b.automatic.midi &&
    a.note.midi === b.note.midi &&
    a.muted === b.muted &&
    Math.abs(a.note.start - b.note.start) <= 0.001 &&
    Math.abs(a.note.duration - b.note.duration) <= 0.001
  );
}
export async function encodeTune(tune: PortableTune): Promise<Uint8Array> {
  const raw = packTune(tune);
  verifyPackedMelody(tune, unpackTune(raw, tune.noteSource.interpretationVersion));
  const gzip = await transform(raw, true),
    useGzip = gzip.length < raw.length;
  return Uint8Array.from([
    ...MAGIC,
    tune.noteSource.interpretationVersion,
    useGzip ? 1 : 0,
    ...(useGzip ? gzip : raw),
  ]);
}
export async function decodeTune(bytes: Uint8Array): Promise<PortableTune> {
  if (
    bytes.length > TUNE_LIMITS.encoded ||
    MAGIC.some((n, i) => bytes[i] !== n) ||
    (bytes[5] !== 1 && bytes[5] !== 2) ||
    (bytes[6] !== 0 && bytes[6] !== 1)
  )
    throw new Error("Unsupported or damaged Diapason tune. Update Diapason if this link is newer.");
  const tune = unpackTune(
    bytes[6] === 1 ? await transform(bytes.slice(7), false) : bytes.slice(7),
    bytes[5],
  );
  processRecording(recordingFromPortableTune(tune, "import-check", 0), []);
  return tune;
}
export function fromBase64Url(text: string): Uint8Array {
  return decodeBase64Url(text, Math.ceil((TUNE_LIMITS.encoded * 4) / 3));
}
