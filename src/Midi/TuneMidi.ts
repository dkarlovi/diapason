import { TUNE_MIDI_PREFIX, readTuneMidiPayload } from "./TuneMidiReader";
import { midiVarLen, notesToMidi } from "./Midi";
import { PROGRAMS } from "./MidiPlayback";
import { tunePlaybackEvents } from "../Inspection/Events";
import { decodeTune, encodeTune } from "../Tune/Tune.codec";
import type { PortableTune } from "../Tune/PortableTune.type";
import { toBase64Url } from "../Encoding/Base64Url";

async function midiBytes(tune: PortableTune, payload: Uint8Array): Promise<Uint8Array> {
  const rendered = tunePlaybackEvents(tune).notes;
  const standard = new Uint8Array(await notesToMidi(rendered, { bpm: tune.bpm }).arrayBuffer());
  const metadata = new TextEncoder().encode(TUNE_MIDI_PREFIX + toBase64Url(payload));
  const track = [
    0,
    0xc0,
    PROGRAMS[tune.play.instrument],
    0,
    0xff,
    0x58,
    4,
    tune.beatsPerBar,
    2,
    24,
    8,
    0,
    0xff,
    1,
    ...midiVarLen(metadata.length),
    ...metadata,
    ...standard.slice(22),
  ];
  const result = new Uint8Array(22 + track.length);
  result.set(standard.slice(0, 22));
  new DataView(result.buffer).setUint32(18, track.length);
  result.set(track, 22);
  return result;
}
export async function encodeTuneMidi(tune: PortableTune): Promise<Blob> {
  return new Blob([new Uint8Array(await midiBytes(tune, await encodeTune(tune))).buffer], {
    type: "audio/midi",
  });
}
export async function decodeTuneMidi(bytes: Uint8Array): Promise<PortableTune> {
  const payload = readTuneMidiPayload(bytes);
  const tune = await decodeTune(payload),
    canonical = await midiBytes(tune, payload);
  if (canonical.length !== bytes.length || canonical.some((b, i) => b !== bytes[i]))
    throw new Error(
      "The MIDI melody does not match its embedded Diapason tune. It may have been changed by another application.",
    );
  return tune;
}
