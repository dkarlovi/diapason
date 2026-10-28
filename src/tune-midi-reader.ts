import { TUNE_LIMITS } from "./portable-tune";
import { fromBase64Url } from "./tune-codec";
export const TUNE_MIDI_PREFIX = "diapason:tune:1:";
const invalid = () => {
  throw new Error(
    "Only intact MIDI files exported from Diapason can be imported. This file is unsupported or changed.",
  );
};
class MidiReader {
  position = 22;
  constructor(private bytes: Uint8Array) {}
  byte(): number {
    if (this.position >= this.bytes.length) return invalid();
    return this.bytes[this.position++]!;
  }
  variable(): number {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.byte();
      n = n * 128 + (b % 128);
      if (b < 128) return n;
    }
    return invalid();
  }
  take(length: number): Uint8Array {
    if (length > this.bytes.length - this.position) return invalid();
    const result = this.bytes.slice(this.position, this.position + length);
    this.position += length;
    return result;
  }
  event(): string | undefined {
    this.variable();
    const status = this.byte();
    if (status === 0xff) {
      const type = this.byte(),
        data = this.take(this.variable());
      return type === 1 ? new TextDecoder("utf-8", { fatal: true }).decode(data) : undefined;
    }
    if (status === 0xc0) this.take(1);
    else if (status === 0x90 || status === 0x80) this.take(2);
    else return invalid();
    return undefined;
  }
}
export function readTuneMidiPayload(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 26 || bytes.length > TUNE_LIMITS.encoded * 2) return invalid();
  const header = [77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107];
  if (header.some((b, i) => bytes[i] !== b)) return invalid();
  if (new DataView(bytes.buffer, bytes.byteOffset).getUint32(18) !== bytes.length - 22)
    return invalid();
  const reader = new MidiReader(bytes);
  let payload: Uint8Array | undefined;
  while (reader.position < bytes.length) {
    const text = reader.event();
    if (!text?.startsWith(TUNE_MIDI_PREFIX)) continue;
    if (payload) return invalid();
    payload = fromBase64Url(text.slice(TUNE_MIDI_PREFIX.length));
  }
  return payload ?? invalid();
}
