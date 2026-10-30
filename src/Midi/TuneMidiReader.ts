import type { MidiEvent } from "./Midi";
import { TUNE_LIMITS } from "../Tune/PortableTune";
import { fromBase64Url } from "../Tune/Tune.codec";
export const TUNE_MIDI_PREFIX = "diapason:tune:1:";
const invalid = () => {
  throw new Error(
    "Only intact MIDI files exported from Diapason can be imported. This file is unsupported or changed.",
  );
};
class MidiReader {
  position = 22;
  ended = false;
  tick = 0;
  events: MidiEvent[] = [];
  program = 0;
  beatsPerBar = 4;
  microsecondsPerQuarter = 500000;
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
  private metaEvent(): string | undefined {
    const type = this.byte(),
      data = this.take(this.variable());
    if (type === 47) {
      if (data.length !== 0 || this.position !== this.bytes.length) return invalid();
      this.ended = true;
    }
    if (type === 81 && (data.length !== 3 || data.every((b) => b === 0))) return invalid();
    if (type === 88 && data.length !== 4) return invalid();
    if (type === 81) this.microsecondsPerQuarter = data[0]! * 65536 + data[1]! * 256 + data[2]!;
    if (type === 88) this.beatsPerBar = data[0]!;
    return type === 1 ? new TextDecoder("utf-8", { fatal: true }).decode(data) : undefined;
  }
  event(): string | undefined {
    this.tick += this.variable();
    const status = this.byte();
    if (status === 0xff) return this.metaEvent();
    const lengths: Record<number, number> = { 192: 1, 144: 2, 128: 2 };
    const length = lengths[status];
    if (length === undefined) return invalid();
    const data = this.take(length);
    if (data.some((b) => b >= 128)) return invalid();
    if (status === 192) this.program = data[0]!;
    else
      this.events.push({
        tick: this.tick,
        type: status === 144 && data[1] !== 0 ? "on" : "off",
        midi: data[0]!,
      });
    return undefined;
  }
}
export function readTuneMidiPayload(bytes: Uint8Array): Uint8Array {
  return readTuneMidiMusic(bytes).payload;
}
/** Decode actual saved musical events using the same strict exported-MIDI reader. */
export function readTuneMidiMusic(bytes: Uint8Array): {
  payload: Uint8Array;
  events: MidiEvent[];
  program: number;
  beatsPerBar: number;
  microsecondsPerQuarter: number;
  ppq: number;
} {
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
  if (!reader.ended) return invalid();
  return {
    payload: payload ?? invalid(),
    events: reader.events,
    program: reader.program,
    beatsPerBar: reader.beatsPerBar,
    microsecondsPerQuarter: reader.microsecondsPerQuarter,
    ppq: 480,
  };
}
