// Editor playback: the recorded audio, or the detected notes through a tiny synth.
// One thing plays at a time; starting a new playback stops the previous one.

import type { NoteEvent } from "./notes";
import { VOICES, DEFAULT_PLAY, type PlaySettings } from "./instruments";
import { activeOutput } from "./midiout";
import { playNotesMidi } from "./midi-playback";
import type { Playback } from "./Playback/Playback.type";
let ctx: AudioContext | null = null;

function context(): AudioContext {
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Notes are turned into voices this far ahead of the audio clock. Longer than the ~1s timer
 * throttling of background tabs, so playback keeps going when the tab is hidden. */
const LOOKAHEAD = 2;
const REFILL_MS = 250;

function track(
  c: AudioContext,
  t0: number,
  duration: number,
  nodes: AudioScheduledSourceNode[],
  output?: GainNode,
): Playback {
  let stopped = false;
  return {
    position: () => {
      const p = c.currentTime - t0;
      return stopped || p > duration ? null : Math.max(0, p);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      // Finished synth voices still own their release tails. Transport cleanup
      // must not cut them off at the nominal note end.
      if (output && c.currentTime >= t0 + duration) return;
      const stopAt = c.currentTime + (output ? 0.015 : 0);
      if (output) {
        output.gain.cancelScheduledValues(c.currentTime);
        output.gain.setValueAtTime(output.gain.value, c.currentTime);
        output.gain.linearRampToValueAtTime(0, stopAt);
      }
      for (const n of nodes) {
        try {
          n.stop(stopAt);
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
  const t0 = c.currentTime + 0.05;
  src.start(t0);
  return track(c, t0, buf.duration, [src]);
}

/** Play notes on the selected MIDI port if one is connected, else through the browser synth. */
export function playNotes(
  notes: NoteEvent[],
  duration: number,
  settings: PlaySettings = DEFAULT_PLAY,
): Playback {
  const { instrument, octave } = settings;
  const port = activeOutput();
  if (port) return playNotesMidi(port, notes, duration, octave, instrument);

  const c = context();
  const voice = VOICES[instrument] ?? VOICES.beep;
  const out = c.createGain();
  out.gain.value = 0.3;
  out.connect(c.destination);
  // The playhead and every voice share this start, however long scheduling takes.
  const t0 = c.currentTime + 0.05;
  const srcs: AudioScheduledSourceNode[] = [];
  const queue = [...notes].sort((a, b) => a.start - b.start);
  let next = 0;
  // Building every voice up front blocks the click for long takes; schedule a window at a time.
  const schedule = () => {
    const horizon = c.currentTime + LOOKAHEAD - t0;
    for (; next < queue.length && queue[next]!.start < horizon; next++) {
      const n = queue[next]!;
      const freq = 440 * 2 ** ((n.midi + 12 * octave - 69) / 12);
      srcs.push(...voice(c, out, freq, t0 + n.start, n.duration));
    }
    if (next === queue.length) clearInterval(refill);
  };
  const refill = setInterval(schedule, REFILL_MS);
  schedule();
  const end = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
  const playback = track(c, t0, Math.max(duration, end), srcs, out);
  return {
    position: playback.position,
    stop: () => {
      clearInterval(refill);
      playback.stop();
    },
  };
}
