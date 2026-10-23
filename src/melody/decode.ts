import { freqToMidi, midiToName, type Frame, type NoteEvent } from "../notes";
import { scalePitchClasses, type Key } from "./key";
import type { Knobs } from "./knobs";
export interface PitchContext {
  key: Key | null;
  harmony: { start: number; end: number; pitchClasses: ReadonlySet<number> }[];
  range: { minMidi: number; maxMidi: number };
  /** Performer's tuning relative to A440, in semitones; subtracted before labelling. */
  tuning: number;
  /** Beat length and the performance's lag behind the click, in seconds. */
  meter: { beat: number; lag: number } | null;
}
/** One performed note, in seconds, with a single continuous pitch. */
export interface Segment {
  start: number;
  duration: number;
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
// without an articulation. Steadiness scales it between these bounds, and the
// slip horizon from zero to the maximum.
const SPLIT_COST_MIN = 0.5;
const SPLIT_COST_MAX = 13;
const SLIP_MAX = 0.25;
// Pull into key trades pitch evidence for musical context: at full pull the
// sung pitch keeps this much weight, and chord tones earn this share of the
// key's bonus. An out-of-key note keeps this much of its claim when it was
// sung clearly.
const PITCH_TRUST_MIN = 0.4;
const HARMONY_SHARE = 0.4;
const KEEP_ODD_NOTES = 0.6;
// Naming considers the semitones around the tuned pitch; moving further is the
// wrong-note fix's job.
const NAMING_REACH = 1.5;

// The pitch detector already drops frames below the sound profile's clarity.
function isVoiced(frame: Frame, knobs: Knobs) {
  return frame.freq !== null && frame.freq > 0 && frame.rms >= knobs.levelGate;
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
function inSeconds(frames: Frame[], piece: Span & { pitch: number }): Segment {
  const time = (index: number) => frames[index]?.t ?? frames.at(-1)!.t + hopOf(frames);
  return {
    start: time(piece.start),
    duration: time(piece.end) - time(piece.start),
    pitch: piece.pitch,
  };
}
export function segmentMelody(frames: Frame[], knobs: Knobs): Segment[] {
  const hop = hopOf(frames);
  const steadiness = Math.min(1, Math.max(0, knobs.steadiness));
  const options = {
    minLength: Math.max(1, Math.round(knobs.minNoteMs / 1000 / hop)),
    slip: (SLIP_MAX * steadiness) / hop,
    splitCost: SPLIT_COST_MIN + (SPLIT_COST_MAX - SPLIT_COST_MIN) * steadiness,
  };
  return voicedSpans(frames, knobs)
    .flatMap((span) => articulations(frames, span))
    .flatMap((piece) => segmentPiece(frames, piece, knobs, options))
    .map((piece) => inSeconds(frames, piece))
    .filter((segment) => segment.duration >= knobs.minNoteMs / 1000);
}
function pitchScore(
  pitch: number,
  state: number,
  knobs: Knobs,
  scale: ReadonlySet<number> | null,
  chord: ReadonlySet<number> | undefined,
): number {
  const distance = Math.abs(pitch - state);
  if (distance > NAMING_REACH) return -Infinity;
  const pc = ((state % 12) + 12) % 12;
  const pull = knobs.keyPull;
  const trust = 1 - (1 - PITCH_TRUST_MIN) * pull;
  const confidence = 1 - Math.min(1, 2 * distance);
  const keyPrior = scale ? pull * (scale.has(pc) ? 1 : -(1 - KEEP_ODD_NOTES * confidence)) : 0;
  const chordPrior = chord?.has(pc) ? HARMONY_SHARE * pull : 0;
  return -trust * (distance / 0.35) ** 2 + (1 - trust) * (keyPrior + chordPrior);
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
  return Float64Array.from({ length: space.count }, (_, s) =>
    pitchScore(pitch, space.low + s, knobs, space.scale, chord),
  );
}
function chordAt(context: PitchContext, segment: Segment) {
  const time = segment.start + segment.duration / 2;
  return context.harmony.find((span) => span.start <= time && time < span.end)?.pitchClasses;
}
const isStep = (a: number, b: number) => Math.abs(a - b) === 1 || Math.abs(a - b) === 2;
// Onsets within this fraction of a beat from the beat itself are accented.
const ACCENT_WINDOW = 0.2;
function offBeat(segment: Segment, meter: PitchContext["meter"]) {
  if (!meter) return true;
  const position = (segment.start - meter.lag) / meter.beat;
  return Math.abs(position - Math.round(position)) > ACCENT_WINDOW;
}
// Passing and neighbour notes decorate the harmony rather than clash with it:
// reached and left by step, and unaccented.
function embellishes(segments: Segment[], labels: number[], i: number, context: PitchContext) {
  const before = labels[i - 1],
    after = labels[i + 1];
  return (
    before !== undefined &&
    after !== undefined &&
    isStep(before, labels[i]!) &&
    isStep(labels[i]!, after) &&
    offBeat(segments[i]!, context.meter)
  );
}
// A whistler who cannot reach a note still means it: a note that clashes with
// the implied chord moves to the chord tone within reach that is nearest to
// what was whistled.
function fixWrongNote(segment: Segment, midi: number, knobs: Knobs, context: PitchContext) {
  const chord = chordAt(context, segment);
  const reach = knobs.maxMoveSemitones;
  if (!chord || !reach || chord.has(((midi % 12) + 12) % 12)) return midi;
  const sung = segment.pitch - context.tuning;
  let best = midi;
  for (let candidate = midi - reach; candidate <= midi + reach; candidate++)
    if (
      chord.has(((candidate % 12) + 12) % 12) &&
      (best === midi || Math.abs(candidate - sung) < Math.abs(best - sung))
    )
      best = candidate;
  return best;
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
function labelSegments(segments: Segment[], knobs: Knobs, context: PitchContext): number[] {
  const low = Math.round(context.range.minMidi);
  const space: LabelSpace = {
    low,
    count: Math.round(context.range.maxMidi) - low + 1,
    scale: context.key ? scalePitchClasses(context.key) : null,
    tuning: context.tuning,
  };
  let previous = new Float64Array(space.count);
  const back: Int32Array[] = [];
  for (const segment of segments) {
    const scores = emissions(segment, chordAt(context, segment), knobs, space);
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
function toNote(segment: Segment, midi: number): NoteEvent {
  return { midi, name: midiToName(midi), start: segment.start, duration: segment.duration };
}
export function notesFromSegments(
  segments: Segment[],
  knobs: Knobs,
  context: PitchContext,
): NoteEvent[] {
  const labels = labelSegments(segments, knobs, context);
  return segments.map((segment, i) =>
    toNote(
      segment,
      embellishes(segments, labels, i, context)
        ? labels[i]!
        : fixWrongNote(segment, labels[i]!, knobs, context),
    ),
  );
}
/** The nearest tuned semitone for every note, with no musical context. */
export function nearestNotes(segments: Segment[], tuning: number): NoteEvent[] {
  return segments.map((segment) => toNote(segment, Math.round(segment.pitch - tuning)));
}
