import { freqToMidi, midiToName, type Frame, type NoteEvent } from "../notes";
import { scalePitchClasses, type Key } from "./key";
import type { Knobs } from "./knobs";
export interface PitchContext {
  key: Key | null;
  harmony: { start: number; end: number; pitchClasses: ReadonlySet<number> }[];
  range: { minMidi: number; maxMidi: number };
  /** Performer's tuning relative to A440, in semitones; subtracted before labelling. */
  tuning?: number;
}
/** One performed note: frame span plus a single continuous pitch. */
export interface Segment {
  start: number;
  end: number;
  pitch: number;
}
interface Span {
  start: number;
  end: number;
}

// A re-articulated note dips at least this far (log10 RMS, ~6 dB) below the
// level on both sides of it within DIP_RADIUS frames.
const DIP_DEPTH = 0.3;
const DIP_RADIUS = 6;
// Changepoint cost, in squared semitones x frames, for starting a new note
// without an articulation. Stickiness scales it between these bounds.
const SPLIT_COST_MIN = 0.5;
const SPLIT_COST_MAX = 13;

function isVoiced(frame: Frame, knobs: Knobs) {
  return (
    frame.freq !== null &&
    frame.freq > 0 &&
    frame.clarity >= knobs.clarityGate &&
    frame.rms >= knobs.levelGate
  );
}
function hopOf(frames: Frame[]) {
  return frames.length > 1 ? frames[1]!.t - frames[0]!.t : 512 / 48000;
}
function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
// Voiced runs. Gaps where the level stays up are pitch-tracker dropouts and are
// bridged when shorter than the silence gap; a real drop in level always splits.
function voicedSpans(frames: Frame[], knobs: Knobs): Span[] {
  const hop = hopOf(frames);
  const spans: Span[] = [];
  let i = 0;
  while (i < frames.length) {
    if (!isVoiced(frames[i]!, knobs)) {
      i++;
      continue;
    }
    let end = i + 1;
    while (end < frames.length && isVoiced(frames[end]!, knobs)) end++;
    const last = spans[spans.length - 1];
    const gap = last ? frames.slice(last.end, i) : [];
    if (
      last &&
      gap.length * hop < knobs.silenceGapMs / 1000 &&
      gap.every((frame) => frame.rms >= knobs.levelGate)
    )
      last.end = end;
    else spans.push({ start: i, end });
    i = end;
  }
  return spans;
}
// Whistlers and singers re-articulate with a brief dip in level. Those dips are
// note boundaries even when the pitch on both sides is the same.
function articulations(frames: Frame[], span: Span): Span[] {
  const level = (i: number) => Math.log10(Math.max(frames[i]!.rms, 1e-6));
  const cuts = [span.start];
  for (let k = span.start + 1; k < span.end - 1; k++) {
    const lo = Math.max(span.start, k - DIP_RADIUS);
    const hi = Math.min(span.end, k + DIP_RADIUS + 1);
    let left = -Infinity,
      right = -Infinity,
      lowest = true;
    for (let j = lo; j < hi; j++) {
      if (level(j) < level(k)) lowest = false;
      if (j < k) left = Math.max(left, level(j));
      if (j > k) right = Math.max(right, level(j));
    }
    if (lowest && left - level(k) >= DIP_DEPTH && right - level(k) >= DIP_DEPTH) {
      cuts.push(k);
      k += DIP_RADIUS;
    }
  }
  cuts.push(span.end);
  return cuts.slice(1).map((end, i) => ({ start: cuts[i]!, end }));
}
// Optimal piecewise-constant fit of the pitch curve (least squares plus a cost
// per extra note), so vibrato and drift inside a held note stay one note while
// sustained steps split.
function pitchChanges(pitch: number[], minLength: number, splitCost: number): Span[] {
  const n = pitch.length;
  if (n < 2 * minLength) return [{ start: 0, end: n }];
  const sum = new Float64Array(n + 1);
  const squares = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    sum[i + 1] = sum[i]! + pitch[i]!;
    squares[i + 1] = squares[i]! + pitch[i]! * pitch[i]!;
  }
  const cost = (a: number, b: number) => {
    const s = sum[b]! - sum[a]!;
    return squares[b]! - squares[a]! - (s * s) / (b - a);
  };
  const best = new Float64Array(n + 1).fill(Infinity);
  const from = new Int32Array(n + 1);
  best[0] = -splitCost;
  for (let end = minLength; end <= n; end++)
    for (let start = 0; start <= end - minLength; start++) {
      if (best[start] === Infinity) continue;
      const candidate = best[start]! + splitCost + cost(start, end);
      if (candidate < best[end]!) {
        best[end] = candidate;
        from[end] = start;
      }
    }
  if (best[n] === Infinity) return [{ start: 0, end: n }];
  const spans: Span[] = [];
  for (let end = n; end > 0; end = from[end]!) spans.unshift({ start: from[end]!, end });
  return spans;
}
// Pieces shorter than the slip horizon join their longer neighbour.
function absorbSlips(spans: Span[], slip: number): Span[] {
  const length = (span: Span) => span.end - span.start;
  for (;;) {
    const i = spans.findIndex((span) => length(span) < slip);
    if (i < 0 || spans.length < 2) return spans;
    const left = spans[i - 1],
      right = spans[i + 1];
    const target = !right || (left && length(left) >= length(right)) ? i - 1 : i + 1;
    const merged = {
      start: Math.min(spans[i]!.start, spans[target]!.start),
      end: Math.max(spans[i]!.end, spans[target]!.end),
    };
    spans.splice(Math.min(i, target), 2, merged);
  }
}
function smoothed(raw: number[]): number[] {
  return raw.map((_, i) => median(raw.slice(Math.max(0, i - 2), i + 3)));
}
// Steady-state pitch: the middle of the note, away from attack and release.
function notePitch(raw: number[]): number {
  const trim = Math.floor(raw.length / 5);
  return median(raw.slice(trim, raw.length - trim));
}
interface PieceOptions {
  minLength: number;
  slip: number;
  splitCost: number;
}
function segmentPiece(frames: Frame[], piece: Span, knobs: Knobs, options: PieceOptions) {
  const indices: number[] = [];
  for (let i = piece.start; i < piece.end; i++) if (isVoiced(frames[i]!, knobs)) indices.push(i);
  if (!indices.length) return [];
  const raw = indices.map((i) => freqToMidi(frames[i]!.freq!));
  const parts = absorbSlips(
    pitchChanges(smoothed(raw), options.minLength, options.splitCost),
    options.slip,
  );
  return parts.map((part) => ({
    start: part.start ? indices[part.start]! : piece.start,
    end: part.end < indices.length ? indices[part.end]! : piece.end,
    pitch: notePitch(raw.slice(part.start, part.end)),
  }));
}
export function segmentMelody(frames: Frame[], knobs: Knobs): Segment[] {
  const hop = hopOf(frames);
  const stickiness = Math.min(1, Math.max(0, knobs.stickiness));
  const options = {
    minLength: Math.max(1, Math.round(knobs.minNoteMs / 1000 / hop)),
    slip: knobs.slipMs / 1000 / hop,
    splitCost: SPLIT_COST_MIN + (SPLIT_COST_MAX - SPLIT_COST_MIN) * stickiness,
  };
  return voicedSpans(frames, knobs)
    .flatMap((span) => articulations(frames, span))
    .flatMap((piece) => segmentPiece(frames, piece, knobs, options))
    .filter((segment) => (segment.end - segment.start) * hop >= knobs.minNoteMs / 1000);
}
function pitchScore(
  pitch: number,
  state: number,
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
    -knobs.pitchTrust * (distance / 0.35) ** 2 + (1 - knobs.pitchTrust) * (keyPrior + chordPrior)
  );
}
interface LabelSpace {
  low: number;
  count: number;
  scale: ReadonlySet<number> | null;
  tuning: number;
}
function emissions(
  segment: Segment,
  chord: ReadonlySet<number> | undefined,
  knobs: Knobs,
  space: LabelSpace,
) {
  const pitch = segment.pitch - space.tuning;
  const scores = Float64Array.from({ length: space.count }, (_, s) =>
    pitchScore(pitch, space.low + s, knobs, space.scale, chord),
  );
  // A pitch outside every state's reach keeps its nearest in-range label.
  if (scores.every((score) => score === -Infinity))
    scores[Math.min(space.count - 1, Math.max(0, Math.round(pitch) - space.low))] = 0;
  return scores;
}
function bestPredecessor(previous: Float64Array, state: number, leapPenalty: number) {
  let best = -Infinity,
    from = 0;
  for (let p = 0; p < previous.length; p++) {
    const candidate = previous[p]! - (leapPenalty * Math.abs(state - p)) / 2;
    if (candidate > best) {
      best = candidate;
      from = p;
    }
  }
  return { best, from };
}
// Note-level Viterbi: each performed note gets one pitch, chosen from its
// tuned pitch, the key, the implied chord and the size of the melodic step.
function labelSegments(
  segments: Segment[],
  frames: Frame[],
  knobs: Knobs,
  context: PitchContext,
): number[] {
  const low = Math.round(context.range.minMidi);
  const space: LabelSpace = {
    low,
    count: Math.round(context.range.maxMidi) - low + 1,
    scale: context.key ? scalePitchClasses(context.key) : null,
    tuning: context.tuning ?? 0,
  };
  let previous = new Float64Array(space.count);
  const back: Int32Array[] = [];
  for (const segment of segments) {
    const time = (frames[segment.start]!.t + (frames[segment.end - 1] ?? frames.at(-1)!).t) / 2;
    const chord = context.harmony.find((span) => span.start <= time && time < span.end);
    const scores = emissions(segment, chord?.pitchClasses, knobs, space);
    const leap = back.length ? knobs.leapPenalty : 0;
    const from = new Int32Array(space.count);
    previous = scores.map((emission, s) => {
      if (emission === -Infinity) return emission;
      const step = bestPredecessor(previous, s, leap);
      from[s] = step.from;
      return step.best + emission;
    });
    back.push(from);
  }
  const labels: number[] = [];
  let state = previous.indexOf(Math.max(...previous));
  for (let i = back.length - 1; i >= 0; i--) {
    labels.unshift(low + state);
    state = back[i]![state]!;
  }
  return labels;
}
export function notesFromSegments(
  segments: Segment[],
  frames: Frame[],
  knobs: Knobs,
  context: PitchContext,
): NoteEvent[] {
  if (!segments.length) return [];
  const end = frames[frames.length - 1]!.t + hopOf(frames);
  const labels = labelSegments(segments, frames, knobs, context);
  return segments.map((segment, i) => {
    const start = frames[segment.start]!.t;
    const midi = labels[i]!;
    return {
      midi,
      name: midiToName(midi),
      start,
      duration: (frames[segment.end]?.t ?? end) - start,
    };
  });
}
