// Small synthesized instruments for MIDI playback. Pure Web Audio, no samples, so it
// works offline. Each voice schedules one note and returns its source nodes (for stop()).

export type InstrumentId = 'epiano' | 'pluck' | 'flute' | 'pad' | 'beep';

export const INSTRUMENTS: { id: InstrumentId; label: string }[] = [
  { id: 'beep', label: 'Plain beep' },
  { id: 'epiano', label: 'Electric piano' },
  { id: 'pluck', label: 'Plucked string' },
  { id: 'flute', label: 'Flute' },
  { id: 'pad', label: 'Soft pad' },
];

export interface PlaySettings {
  instrument: InstrumentId;
  /** Octaves to shift playback by (whistles sit around C6–C7; the instruments may sound better lower). */
  octave: number;
}

export const DEFAULT_PLAY: PlaySettings = { instrument: 'beep', octave: 0 };

type Voice = (c: AudioContext, out: AudioNode, freq: number, at: number, dur: number) => AudioScheduledSourceNode[];

/** Attack → hold → release envelope on a fresh gain node; returns it and the time it's silent. */
function envelope(c: AudioContext, at: number, dur: number, attack: number, release: number, peak = 1): [GainNode, number] {
  const g = c.createGain();
  const off = at + Math.max(attack, dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(peak, at + attack);
  g.gain.setValueAtTime(peak, off);
  g.gain.setTargetAtTime(0, off, release / 4);
  return [g, off + release];
}

const beep: Voice = (c, out, freq, at, dur) => {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const [env, end] = envelope(c, at, dur, 0.01, 0.03);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(end);
  return [osc];
};

/** 2-operator FM: bright "tine" attack mellowing into a sine, with a natural decay. */
const epiano: Voice = (c, out, freq, at, dur) => {
  const car = c.createOscillator();
  const mod = c.createOscillator();
  car.frequency.value = freq;
  mod.frequency.value = freq;
  const depth = c.createGain();
  depth.gain.setValueAtTime(freq * 2.5, at);
  depth.gain.setTargetAtTime(freq * 0.3, at, 0.25);
  mod.connect(depth).connect(car.frequency);

  const [env, end] = envelope(c, at, dur, 0.004, 0.25);
  const decay = c.createGain(); // piano-like: level falls even while the key is held
  decay.gain.setValueAtTime(1, at);
  decay.gain.setTargetAtTime(0.35, at, 0.6);
  car.connect(decay).connect(env).connect(out);
  for (const o of [car, mod]) {
    o.start(at);
    o.stop(end);
  }
  return [car, mod];
};

/** Karplus–Strong string, rendered into a buffer; playbackRate corrects the integer-delay tuning. */
const pluck: Voice = (c, out, freq, at, dur) => {
  const sr = c.sampleRate;
  const period = Math.max(2, Math.floor(sr / freq));
  const len = Math.ceil(sr * Math.min(3, dur + 0.6));
  const buf = c.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  for (let i = 0; i < period; i++) y[i] = Math.random() * 2 - 1;
  // Two-tap average = gentle low-pass in the loop; it adds half a sample of delay.
  for (let i = period; i < len; i++) y[i] = 0.4995 * (y[i - period]! + y[Math.max(0, i - period - 1)]!);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = freq / (sr / (period + 0.5));
  const [env, end] = envelope(c, at, dur, 0.002, 0.15, 0.8);
  src.connect(env).connect(out);
  src.start(at);
  src.stop(end);
  return [src];
};

let noise: AudioBuffer | null = null;
function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise?.sampleRate === c.sampleRate) return noise;
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** Sine + a touch of 2nd harmonic, breath noise, and delayed vibrato. */
const flute: Voice = (c, out, freq, at, dur) => {
  const tone = c.createOscillator();
  tone.frequency.value = freq;
  const h2 = c.createOscillator();
  h2.frequency.value = freq * 2;
  const h2g = c.createGain();
  h2g.gain.value = 0.12;

  const vib = c.createOscillator();
  vib.frequency.value = 5;
  const vibDepth = c.createGain();
  vibDepth.gain.setValueAtTime(0, at);
  vibDepth.gain.linearRampToValueAtTime(freq * 0.006, at + 0.3);
  vib.connect(vibDepth);
  vibDepth.connect(tone.frequency);

  const breath = c.createBufferSource();
  breath.buffer = noiseBuffer(c);
  breath.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = 2;
  const bg = c.createGain();
  bg.gain.value = 0.15;

  const [env, end] = envelope(c, at, dur, 0.05, 0.1, 0.8);
  tone.connect(env);
  h2.connect(h2g).connect(env);
  breath.connect(bp).connect(bg).connect(env);
  env.connect(out);
  const srcs = [tone, h2, vib, breath];
  for (const s of srcs) {
    s.start(at);
    s.stop(end);
  }
  return srcs;
};

/** Two detuned saws through a low-pass, slow attack and release. */
const pad: Voice = (c, out, freq, at, dur) => {
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(4000, freq * 3);
  lp.Q.value = 0.7;
  const [env, end] = envelope(c, at, dur, 0.12, 0.4, 0.5);
  lp.connect(env).connect(out);
  const oscs = [-7, 7].map((cents) => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = cents;
    o.connect(lp);
    o.start(at);
    o.stop(end);
    return o;
  });
  return oscs;
};

export const VOICES: Record<InstrumentId, Voice> = { epiano, pluck, flute, pad, beep };
