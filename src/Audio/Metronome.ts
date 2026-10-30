// Audible metronome with a count-in, scheduled on the AudioContext clock for timing
// accuracy. It guides the performer; its schedule must not erase captured audio.

export interface TransportState {
  bpm: number;
  beatsPerBar: number;
  downbeatTime: number;
  phase: "preview" | "count-in" | "recording";
  running: boolean;
}

export interface MetronomeHandle {
  /** ctx.currentTime of the downbeat (beat 0) — recording should align audio t=0 here. */
  downbeatTime: number;
  stop(): void;
}

export interface MetronomeOptions {
  bpm: number;
  beatsPerBar: number;
  /** Bars of count-in before the downbeat. Default 1. */
  countInBars?: number;
  /** Small lead before the first click, seconds. Default 0.15. */
  lead?: number;
  /** Called when the audio clock reaches the downbeat (polled every 25 ms). */
  onDownbeat?: () => void;
  /** Called with the current beat index on each scheduled beat (negative = count-in). */
  onBeat?: (beat: number) => void;
}

/** Zero-based beat within the bar; beat one keeps its own downbeat accent. */
export function hasBeatSubdivision(bpm: number, beatInBar: number): boolean {
  return bpm < 120 && beatInBar > 0 && beatInBar % 2 === 0;
}

function click(
  ctx: AudioContext,
  at: number,
  accent: boolean,
  subdivision: boolean,
  pending: Set<() => void>,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  const level = subdivision ? 0.15 : accent ? 0.5 : 0.3;
  const dur = 0.04;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
  const release = () => {
    osc.disconnect();
    gain.disconnect();
    pending.delete(cancel);
  };
  const cancel = () => {
    try {
      osc.stop(ctx.currentTime);
    } finally {
      release();
    }
  };
  pending.add(cancel);
  osc.onended = release;
  osc.start(at);
  osc.stop(at + dur);
}

export function startMetronome(ctx: AudioContext, opts: MetronomeOptions): MetronomeHandle {
  const { bpm, beatsPerBar } = opts;
  const countInBars = opts.countInBars ?? 1;
  const lead = opts.lead ?? 0.15;
  const beat = 60 / bpm;
  const countInBeats = countInBars * beatsPerBar;

  const t0 = ctx.currentTime + lead; // first count-in click
  const downbeatTime = t0 + countInBeats * beat;

  // Lookahead scheduler: only ever schedule ~120ms ahead, so stop() reliably halts it.
  const AHEAD = 0.12;
  const due: { at: number; index: number }[] = [];
  let downbeatReported = false;
  const pending = new Set<() => void>();
  let next = 0;

  const scheduler = window.setInterval(() => {
    while (t0 + next * beat < ctx.currentTime + AHEAD) {
      const at = t0 + next * beat;
      const beatIndex = Math.floor(next) - countInBeats; // 0 == downbeat
      const beatInBar = ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar;
      const subdivision = next % 1 !== 0;
      if (!subdivision || hasBeatSubdivision(bpm, beatInBar)) {
        click(ctx, at, beatInBar === 0, subdivision, pending);
      }
      if (!subdivision && opts.onBeat) due.push({ at, index: beatIndex });
      next += 0.5;
    }
    while (due.length && due[0]!.at <= ctx.currentTime) opts.onBeat?.(due.shift()!.index);
    if (!downbeatReported && ctx.currentTime >= downbeatTime) {
      downbeatReported = true;
      opts.onDownbeat?.();
    }
  }, 25);

  return {
    downbeatTime,
    stop(): void {
      window.clearInterval(scheduler);
      due.length = 0;
      for (const cancel of pending) cancel();
    },
  };
}
