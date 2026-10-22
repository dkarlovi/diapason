// Optional Web MIDI output: play takes through an external synth / DAW instead of the
// browser synth. The chosen port is a per-machine preference (port ids are device-specific),
// unlike instrument/octave which belong to the take.

import type { NoteEvent } from "./notes";
import type { Playback } from "./playback";

const KEY = "diapason.midiOutput";
const CHANNEL = 0; // MIDI channel 1

let access: MIDIAccess | null = null;
const listeners = new Set<() => void>();
const notify = (): void => listeners.forEach((cb) => cb());

export const midiSupported = (): boolean => typeof navigator.requestMIDIAccess === "function";

/** Ask for MIDI access. With `prompt: false` only succeeds if permission was already granted. */
export async function connectMidi(prompt: boolean): Promise<boolean> {
  if (access) return true;
  if (!midiSupported()) return false;
  if (!prompt) {
    try {
      const st = await navigator.permissions.query({ name: "midi" as PermissionName });
      if (st.state !== "granted") return false;
    } catch {
      return false; // permission can't be queried — wait for an explicit request
    }
  }
  try {
    access = await navigator.requestMIDIAccess();
    access.onstatechange = notify;
    notify();
    return true;
  } catch {
    return false;
  }
}

/** Called when ports come and go, access is granted, or the selected output changes. */
export function onOutputChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function midiOutputs(): MIDIOutput[] {
  return access ? [...access.outputs.values()] : [];
}

/** Selected output id, or '' for the browser synth. */
export function selectedOutputId(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function selectOutput(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // not persisted — fine
  }
  notify();
}

/** The selected output if it's connected right now; otherwise null (use the browser synth). */
export function activeOutput(): MIDIOutput | null {
  const id = selectedOutputId();
  return (id && access?.outputs.get(id)) || null;
}

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
    const off = on + Math.max(20, n.duration * 1000 - 5);
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
