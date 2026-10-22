// Audible metronome with a count-in, scheduled on the AudioContext clock for timing
// accuracy. The click bleeds into the raw mic, but because every beat is at a known
// time it's masked at detection time (see analyzeBuffer `maskBpm`) — not cancelled.

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
  /** Called (via setTimeout) roughly when the downbeat occurs. */
  onDownbeat?: () => void;
  /** Called with the current beat index on each scheduled beat (negative = count-in). */
  onBeat?: (beat: number) => void;
}

function click(ctx: AudioContext, at: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  const dur = 0.04;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain).connect(ctx.destination);
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
  const timers: number[] = [];
  let next = 0;
  let stopped = false;

  const scheduler = window.setInterval(() => {
    while (t0 + next * beat < ctx.currentTime + AHEAD) {
      const at = t0 + next * beat;
      const beatIndex = next - countInBeats; // 0 == downbeat
      const accent = ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
      click(ctx, at, accent);
      if (opts.onBeat)
        timers.push(
          window.setTimeout(
            () => opts.onBeat!(beatIndex),
            Math.max(0, (at - ctx.currentTime) * 1000),
          ),
        );
      next++;
    }
  }, 25);

  if (opts.onDownbeat) {
    timers.push(
      window.setTimeout(
        () => !stopped && opts.onDownbeat!(),
        Math.max(0, (downbeatTime - ctx.currentTime) * 1000),
      ),
    );
  }

  return {
    downbeatTime,
    stop(): void {
      stopped = true;
      window.clearInterval(scheduler);
      for (const t of timers) window.clearTimeout(t);
    },
  };
}
