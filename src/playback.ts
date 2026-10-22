// Editor playback: the recorded audio, or the detected notes through a tiny synth.
// One thing plays at a time; starting a new playback stops the previous one.

import type { NoteEvent } from "./notes";
import { VOICES, DEFAULT_PLAY, type PlaySettings } from "./instruments";
import { activeOutput, playNotesMidi } from "./midiout";

export interface Playback {
  /** Seconds into the take, or null once finished/stopped. */
  position(): number | null;
  stop(): void;
}

let ctx: AudioContext | null = null;

function context(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function track(c: AudioContext, duration: number, nodes: AudioScheduledSourceNode[]): Playback {
  const t0 = c.currentTime + 0.05;
  let stopped = false;
  return {
    position: () => {
      const p = c.currentTime - t0;
      return stopped || p > duration ? null : Math.max(0, p);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          // not started yet / already stopped
        }
      }
    },
  };
}

export function playPcm(pcm: Float32Array, sampleRate: number): Playback {
  const c = context();
  const buf = c.createBuffer(1, pcm.length, sampleRate);
  buf.getChannelData(0).set(pcm);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(c.destination);
  const pb = track(c, buf.duration, [src]);
  src.start(c.currentTime + 0.05);
  return pb;
}

/** Play notes on the selected MIDI port if one is connected, else through the browser synth. */
export function playNotes(
  notes: NoteEvent[],
  duration: number,
  settings: PlaySettings = DEFAULT_PLAY,
): Playback {
  const { instrument, octave } = settings;
  const port = activeOutput();
  if (port) return playNotesMidi(port, notes, duration, octave);

  const c = context();
  const voice = VOICES[instrument] ?? VOICES.beep;
  const out = c.createGain();
  out.gain.value = 0.3;
  out.connect(c.destination);
  const t0 = c.currentTime + 0.05;
  const srcs: AudioScheduledSourceNode[] = [];
  for (const n of notes) {
    const freq = 440 * 2 ** ((n.midi + 12 * octave - 69) / 12);
    srcs.push(...voice(c, out, freq, t0 + n.start, Math.max(0.03, n.duration)));
  }
  const end = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
  return track(c, Math.max(duration, end), srcs);
}
