import { steppedNotes } from "../Melody/PitchCurve";
import { bendMessages, midiMessage } from "./MidiBend";
import type { MidiEvent } from "./Midi.type";
import type { NoteEvent } from "../Melody/Notes";
import { DEFAULT_PLAY, type InstrumentId } from "../Playback/Instruments";
import type { Playback } from "../Playback/Playback.type";
import type { MidiSink } from "./MidiPlayback.type";

const CHANNEL = 0; // MIDI channel 1

// General MIDI programs (zero-based): square lead, electric piano, steel-string guitar,
// flute, trumpet, alto sax, warm pad. External soundfonts approximate the browser synth voices.
export const PROGRAMS: Record<InstrumentId, number> = {
  beep: 80,
  epiano: 4,
  pluck: 25,
  flute: 73,
  trumpet: 56,
  saxophone: 65,
  pad: 89,
};

/** Keep future events in the app so Stop never depends on a driver's MIDI queue. */
export function playNotesMidi(
  out: MidiSink,
  notes: NoteEvent[],
  duration: number,
  octave: number,
  instrument: InstrumentId = DEFAULT_PLAY.instrument,
): Playback {
  const t0 = performance.now() + 50;
  const keys = new Set<number>();
  const events: { at: number; event: MidiEvent; end: number }[] = [];
  let bent = false;
  out.send([0xc0 | CHANNEL, PROGRAMS[instrument] ?? PROGRAMS.beep]);
  for (const n of steppedNotes(notes)) {
    const key = Math.round(n.midi) + 12 * octave;
    if (key < 0 || key > 127) continue;
    const on = t0 + n.start * 1000;
    // End a hair early so back-to-back same notes don't swallow the next note-on.
    const off = on + Math.max(0, n.duration * 1000 - Math.min(5, n.duration * 500));
    const bends = bendMessages(n);
    for (const { position: _position, ...event } of bends.filter((b) => b.position === 0))
      events.push({ at: on, event: { ...event, tick: 0 }, end: off });
    events.push({ at: on, event: { tick: 0, midi: key, type: "on" }, end: off });
    for (const { position, ...event } of bends.filter((b) => b.position > 0 && b.position < 1)) {
      const at = on + position * n.duration * 1000;
      if (at < off) events.push({ at, event: { ...event, tick: 0 }, end: off });
    }
    events.push({ at: off, event: { tick: 0, midi: key, type: "off" }, end: off });
    if (bends.length)
      events.push({ at: off, event: { tick: 0, type: "bend", value: 8192 }, end: Infinity });
  }
  const end = Math.max(
    duration,
    notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0),
  );
  events.sort((a, b) => a.at - b.at);
  let stopped = false;
  let next = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispatch = () => {
    if (stopped) return;
    const now = performance.now();
    while (next < events.length && events[next]!.at <= now) {
      const scheduled = events[next++]!;
      const event = scheduled.event;
      // Expired notes must not replay their pitch configuration after timer throttling.
      if (event.type !== "off" && scheduled.end <= now) continue;
      out.send(midiMessage(event, 100));
      if (event.type === "bend") bent = event.value !== 8192;
      if (event.type === "on") keys.add(event.midi);
      else if (event.type === "off") keys.delete(event.midi);
    }
    if (next < events.length) {
      timer = setTimeout(dispatch, Math.max(1, events[next]!.at - performance.now()));
    }
  };
  dispatch();
  return {
    position: () => {
      const p = (performance.now() - t0) / 1000;
      return stopped || p > end ? null : Math.max(0, p);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      out.clear?.(); // drop still-scheduled messages (not in every browser)
      for (const key of keys) out.send([0x80 | CHANNEL, key, 0]);
      if (bent) out.send([0xe0, 0, 64]);
      // Transport completion must preserve the soundfont's natural release tails,
      // just like browser synth playback. An interruption still silences immediately.
      if (performance.now() >= t0 + end * 1000) return;
      out.send([0xb0 | CHANNEL, 123, 0]); // all notes off
      out.send([0xb0 | CHANNEL, 120, 0]); // all sound off, including release tails
    },
  };
}
