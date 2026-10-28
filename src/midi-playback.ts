import type { NoteEvent } from "./notes";
import type { Playback } from "./playback";
import { DEFAULT_PLAY, type InstrumentId } from "./instruments";

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
  out: MIDIOutput,
  notes: NoteEvent[],
  duration: number,
  octave: number,
  instrument: InstrumentId = DEFAULT_PLAY.instrument,
): Playback {
  const t0 = performance.now() + 50;
  const keys = new Set<number>();
  const events: { at: number; key: number; on: boolean; end: number }[] = [];
  out.send([0xc0 | CHANNEL, PROGRAMS[instrument] ?? PROGRAMS.beep]);
  for (const n of notes) {
    const key = Math.round(n.midi) + 12 * octave;
    if (key < 0 || key > 127) continue;
    const on = t0 + n.start * 1000;
    // End a hair early so back-to-back same notes don't swallow the next note-on.
    const off = on + Math.max(0, n.duration * 1000 - Math.min(5, n.duration * 500));
    events.push({ at: on, key, on: true, end: off }, { at: off, key, on: false, end: off });
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
    const now = performance.now();
    while (next < events.length && events[next]!.at <= now) {
      const event = events[next++]!;
      // A throttled callback must not replay notes that have already ended.
      if (event.on && event.end <= now) continue;
      out.send([event.on ? 0x90 | CHANNEL : 0x80 | CHANNEL, event.key, event.on ? 100 : 0]);
      if (event.on) keys.add(event.key);
      else keys.delete(event.key);
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
      (out as MIDIOutput & { clear?: () => void }).clear?.(); // drop still-scheduled messages (not in every browser)
      for (const key of keys) out.send([0x80 | CHANNEL, key, 0]);
      // Transport completion must preserve the soundfont's natural release tails,
      // just like browser synth playback. An interruption still silences immediately.
      if (performance.now() >= t0 + end * 1000) return;
      out.send([0xb0 | CHANNEL, 123, 0]); // all notes off
      out.send([0xb0 | CHANNEL, 120, 0]); // all sound off, including release tails
    },
  };
}
