import { freqToMidi, midiToName, type Frame, type NoteEvent } from "../notes";
import { scalePitchClasses, type Key } from "./key";
import type { Knobs } from "./knobs";
export interface PitchContext {
  key: Key | null;
  harmony: { start: number; end: number; pitchClasses: ReadonlySet<number> }[];
  range: { minMidi: number; maxMidi: number };
}
interface Run {
  state: number;
  start: number;
  end: number;
}

function isVoiced(frame: Frame, knobs: Knobs) {
  return (
    frame.freq !== null &&
    frame.freq > 0 &&
    frame.clarity >= knobs.clarityGate &&
    frame.rms >= knobs.levelGate
  );
}
// Pool log-frequency evidence over the slip horizon. A short excursion can then
// support the sustained pitch on either side instead of becoming its own note.
// Separate voiced spans keep real silences from contributing across a reattack.
function pooledPitches(frames: Frame[], knobs: Knobs): Float64Array {
  const raw = Float64Array.from(frames, (frame) =>
    isVoiced(frame, knobs) ? freqToMidi(frame.freq!) : NaN,
  );
  const pooled = raw.slice();
  let start = 0;
  while (start < raw.length) {
    if (Number.isNaN(raw[start]!)) {
      start++;
      continue;
    }
    let end = start + 1;
    while (end < raw.length && !Number.isNaN(raw[end]!)) end++;
    poolSpan(raw, pooled, frames, start, end, knobs.slipMs / 2000);
    start = end;
  }
  return pooled;
}
function poolSpan(
  raw: Float64Array,
  pooled: Float64Array,
  frames: Frame[],
  start: number,
  end: number,
  radius: number,
) {
  let left = start,
    right = start,
    weighted = 0,
    weight = 0;
  for (let i = start; i < end; i++) {
    const t = frames[i]!.t;
    while (right < end && frames[right]!.t <= t + radius) {
      const clarity = frames[right]!.clarity;
      weighted += raw[right]! * clarity;
      weight += clarity;
      right++;
    }
    while (left < right && frames[left]!.t < t - radius) {
      const clarity = frames[left]!.clarity;
      weighted -= raw[left]! * clarity;
      weight -= clarity;
      left++;
    }
    pooled[i] = weighted / weight;
  }
}
function observations(
  frames: Frame[],
  knobs: Knobs,
  context: PitchContext,
  low: number,
  count: number,
) {
  const scores = new Float64Array(frames.length * count).fill(-Infinity);
  const scale = context.key ? scalePitchClasses(context.key) : null;
  const pitches = pooledPitches(frames, knobs);
  let chordIndex = 0;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]!;
    const offset = i * count;
    const voiced = isVoiced(frame, knobs);
    scores[offset + count - 1] = voiced ? -8 : 0;
    if (!voiced) continue;
    const pitch = pitches[i]!;
    while (chordIndex < context.harmony.length && context.harmony[chordIndex]!.end <= frame.t)
      chordIndex++;
    const chord = context.harmony[chordIndex];
    for (let s = 0; s < count - 1; s++) {
      scores[offset + s] = pitchScore(
        pitch,
        low + s,
        frame.clarity,
        knobs,
        scale,
        chord && frame.t >= chord.start ? chord.pitchClasses : undefined,
      );
    }
  }
  return scores;
}
function pitchScore(
  pitch: number,
  state: number,
  clarity: number,
  knobs: Knobs,
  scale: ReadonlySet<number> | null,
  chord: ReadonlySet<number> | undefined,
): number {
  const distance = Math.abs(pitch - state);
  if (distance > knobs.maxMoveSemitones + 0.5) return -Infinity;
  const pc = ((state % 12) + 12) % 12;
  const confidence = 1 - Math.min(1, 2 * distance);
  const keyPrior = scale
    ? knobs.keyPull * (scale.has(pc) ? 1 : -(1 - knobs.keepOddNotes * confidence))
    : 0;
  const chordPrior = chord?.has(pc) ? knobs.harmonyPull : 0;
  return (
    -knobs.pitchTrust * (distance / 0.35) ** 2 * clarity +
    (1 - knobs.pitchTrust) * (keyPrior + chordPrior)
  );
}
function transitionCosts(count: number, knobs: Knobs) {
  const costs = new Float64Array(count * count);
  for (let s = 0; s < count; s++)
    for (let p = 0; p < count; p++) {
      if (s === p) continue;
      costs[s * count + p] =
        s === count - 1 || p === count - 1
          ? 1
          : knobs.stickiness * 8 + (knobs.leapPenalty * Math.abs(s - p)) / 2;
    }
  return costs;
}
interface Trellis {
  scores: Float64Array;
  costs: Float64Array;
  back: Int16Array;
  previous: Float64Array;
  current: Float64Array;
}
function advance(trellis: Trellis, offset: number) {
  const { scores, costs, back, previous, current } = trellis;
  const count = current.length;
  for (let s = 0; s < count; s++) {
    const emission = scores[offset + s]!;
    let best = -Infinity;
    let from = 0;
    if (emission !== -Infinity)
      for (let p = 0; p < count; p++) {
        const candidate = previous[p]! - costs[s * count + p]!;
        if (candidate >= best) {
          best = candidate;
          from = p;
        }
      }
    current[s] = best + emission;
    back[offset + s] = from;
  }
  trellis.previous = current;
  trellis.current = previous;
}
function bestPath(scores: Float64Array, count: number, knobs: Knobs) {
  const length = scores.length / count;
  const back = new Int16Array(scores.length);
  const labels = new Int16Array(length);
  const trellis: Trellis = {
    scores,
    costs: transitionCosts(count, knobs),
    back,
    previous: new Float64Array(count),
    current: new Float64Array(count),
  };
  for (let i = 0; i < length; i++) advance(trellis, i * count);
  const previous = trellis.previous;
  let state = 0;
  for (let s = 1; s < count; s++) if (previous[s]! >= previous[state]!) state = s;
  for (let i = length - 1; i >= 0; i--) {
    labels[i] = state;
    state = back[i * count + state]!;
  }
  return labels;
}
function runsOf(labels: Int16Array): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < labels.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.state === labels[i]) last.end = i + 1;
    else runs.push({ state: labels[i]!, start: i, end: i + 1 });
  }
  return runs;
}
function settleRuns(
  labels: Int16Array,
  frames: Frame[],
  knobs: Knobs,
  rest: number,
  endTime: number,
) {
  const time = (index: number) => frames[index]?.t ?? endTime;
  // Short voiced excursions attach to the longer adjacent voiced run. Real rests
  // remain barriers, even when their duration is shorter than the slip control.
  const context = { labels, rest, time };
  absorbSlips(context, knobs.slipMs / 1000);
  bridgeRests(context, knobs.silenceGapMs / 1000);
  return runsOf(labels);
}
interface RunContext {
  labels: Int16Array;
  rest: number;
  time: (index: number) => number;
}
function absorbSlips(context: RunContext, slip: number) {
  let changed = true;
  while (changed) changed = absorbPass(context, slip);
}
function absorbPass(context: RunContext, slip: number) {
  const { labels, rest, time } = context;
  const runs = runsOf(labels);
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]!;
    if (run.state === rest || time(run.end) - time(run.start) >= slip) continue;
    const target = [runs[i - 1], runs[i + 1]]
      .filter((candidate): candidate is Run => candidate !== undefined && candidate.state !== rest)
      .sort((a, b) => time(b.end) - time(b.start) - (time(a.end) - time(a.start)))[0];
    if (target && time(target.end) - time(target.start) > time(run.end) - time(run.start)) {
      labels.fill(target.state, run.start, run.end);
      return true;
    }
  }
  return false;
}
function bridgeRests({ labels, rest, time }: RunContext, gap: number) {
  const runs = runsOf(labels);
  for (let i = 1; i < runs.length - 1; i++) {
    const run = runs[i]!;
    if (
      run.state === rest &&
      time(run.end) - time(run.start) < gap &&
      runs[i - 1]!.state === runs[i + 1]!.state
    )
      labels.fill(runs[i - 1]!.state, run.start, run.end);
  }
}
export function decodeMelody(frames: Frame[], knobs: Knobs, context: PitchContext): NoteEvent[] {
  if (!frames.length) return [];
  const low = Math.round(context.range.minMidi);
  const count = Math.round(context.range.maxMidi) - low + 2;
  if (count < 2 || count > 32767) return [];
  const scores = observations(frames, knobs, context, low, count);
  const labels = bestPath(scores, count, knobs);
  const hop = frames.length > 1 ? frames[1]!.t - frames[0]!.t : 512 / 48000;
  const end = frames[frames.length - 1]!.t + hop;
  return settleRuns(labels, frames, knobs, count - 1, end)
    .filter((run) => run.state !== count - 1)
    .map((run) => {
      const start = frames[run.start]!.t;
      const midi = low + run.state;
      return { midi, name: midiToName(midi), start, duration: (frames[run.end]?.t ?? end) - start };
    })
    .filter((note) => note.duration >= knobs.minNoteMs / 1000);
}
