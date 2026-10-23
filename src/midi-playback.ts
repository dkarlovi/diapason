import type { NoteEvent } from "./notes";
import type { Playback } from "./playback";

const CHANNEL = 0; // MIDI channel 1

/** Schedule notes on a MIDI port with timestamps, so timing doesn't depend on JS timers. */
export function playNotesMidi(
  out: MIDIOutput,
  notes: NoteEvent[],
  duration: number,
  octave: number,
): Playback {
  const t0 = performance.now() + 50;
  const keys = new Set<number>();
  for (const n of notes) {
    const key = Math.round(n.midi) + 12 * octave;
    if (key < 0 || key > 127) continue;
    keys.add(key);
    const on = t0 + n.start * 1000;
    // End a hair early so back-to-back same notes don't swallow the next note-on.
    const off = on + Math.max(0, n.duration * 1000 - Math.min(5, n.duration * 500));
    out.send([0x90 | CHANNEL, key, 100], on);
    out.send([0x80 | CHANNEL, key, 0], off);
  }
  const end = Math.max(
    duration,
    notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0),
  );
  let stopped = false;
  return {
    position: () => {
      const p = (performance.now() - t0) / 1000;
      return stopped || p > end ? null : Math.max(0, p);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      (out as MIDIOutput & { clear?: () => void }).clear?.(); // drop still-scheduled messages (not in every browser)
      for (const key of keys) out.send([0x80 | CHANNEL, key, 0]);
      out.send([0xb0 | CHANNEL, 123, 0]); // all notes off
    },
  };
}
