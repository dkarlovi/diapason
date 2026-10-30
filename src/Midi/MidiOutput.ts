// Optional Web MIDI output: play recordings through an external synth / DAW instead of the
// browser synth. The chosen port is a per-machine preference (port ids are device-specific),
// unlike instrument/octave which belong to the recording.

const KEY = "diapason.midiOutput";

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
