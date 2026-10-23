import type { MutedNote, Recording } from "./db";
import type { Frame } from "./notes";
import type { QualityStats } from "./recorder";
import { analysisOptionsFor } from "./recording-profiles";
import type { ReportInput } from "./diagnostics";
import type { NoteItem } from "./recording";
import { covers } from "./recording";
import type { TraceView } from "./trace";
import { DEFAULT_TUNING, type Tuning } from "./tuning";

export interface SliderDef {
  key: keyof Tuning;
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  tip: string;
}

export const SLIDERS: SliderDef[] = [
  {
    key: "hysteresisSemitones",
    id: "t-sticky",
    label: "Stickiness",
    min: 0,
    max: 1,
    step: 0.05,
    tip: "How far pitch can drift before a new note starts.",
  },
  {
    key: "minDurationSec",
    id: "t-minlen",
    label: "Min note length",
    min: 20,
    max: 300,
    step: 10,
    tip: "Notes shorter than this are dropped.",
  },
  {
    key: "silenceGapSec",
    id: "t-silence",
    label: "Silence gap",
    min: 30,
    max: 300,
    step: 10,
    tip: "A quiet gap this long ends the current note.",
  },
  {
    key: "changeDebounceSec",
    id: "t-debounce",
    label: "Change debounce",
    min: 0,
    max: 200,
    step: 10,
    tip: "A new pitch must hold this long before it splits the note.",
  },
  {
    key: "medianWindow",
    id: "t-smooth",
    label: "Smoothing",
    min: 1,
    max: 11,
    step: 2,
    tip: "Median filter width in frames.",
  },
  {
    key: "clarityThreshold",
    id: "t-clarity",
    label: "Clarity gate",
    min: 0.85,
    max: 0.999,
    step: 0.005,
    tip: "Minimum detection confidence per frame.",
  },
  {
    key: "rmsGate",
    id: "t-gate",
    label: "Level gate",
    min: 0.001,
    max: 0.1,
    step: 0.001,
    tip: "Frames quieter than this are silence.",
  },
];

const milliseconds = new Set<keyof Tuning>([
  "minDurationSec",
  "silenceGapSec",
  "changeDebounceSec",
]);

export function sliderValue(key: keyof Tuning, tuning: Tuning): number {
  return milliseconds.has(key) ? Math.round(tuning[key] * 1000) : tuning[key];
}

export function updateTuning(tuning: Tuning, key: keyof Tuning, value: number): Tuning {
  return { ...tuning, [key]: milliseconds.has(key) ? value / 1000 : value };
}

export function sliderLabel(key: keyof Tuning, value: number): string {
  if (key === "hysteresisSemitones") return `±${(0.5 + value).toFixed(2)} st`;
  if (milliseconds.has(key)) return `${value} ms`;
  if (key === "medianWindow") return `${value} fr`;
  return value.toFixed(3);
}

export interface RollPoint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function noteAtPoint(
  items: NoteItem[],
  view: Pick<TraceView, "tMin" | "tMax" | "midiMin" | "midiMax">,
  point: RollPoint,
): NoteItem | null {
  if (!point.width || !point.height) return null;
  const t = view.tMin + (point.x / point.width) * (view.tMax - view.tMin);
  const midi = view.midiMax - (point.y / point.height) * (view.midiMax - view.midiMin);
  const padT = (4 / point.width) * (view.tMax - view.tMin);
  let best: NoteItem | null = null;
  for (const item of items) {
    const { start, duration } = item.note;
    if (t < start - padT || t > start + duration + padT) continue;
    const distance = Math.abs(midi - item.note.midi);
    if (distance <= 0.75 && (!best || distance < Math.abs(midi - best.note.midi))) best = item;
  }
  return best;
}

export function toggleMuted(muted: MutedNote[], item: NoteItem): MutedNote[] {
  return item.muted
    ? muted.filter((anchor) => !covers(anchor, item.raw))
    : [...muted, { t: item.raw.start + item.raw.duration / 2, midi: item.raw.midi }];
}

export function exportSlug(name: string, now: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `diapason-${base || "recording"}-${now}`;
}

export function makeReportInput(
  record: Recording,
  frames: Frame[],
  stats: QualityStats,
): ReportInput {
  const analysis = analysisOptionsFor(record);
  return {
    recording: record,
    title: record.name,
    sampleRate: record.sampleRate,
    durationSec: record.durationSec,
    windowSize: analysis.windowSize,
    hop: analysis.hop,
    detector: {
      minFreq: analysis.minFreq,
      maxFreq: analysis.maxFreq,
      clarityThreshold: analysis.clarityThreshold,
    },
    rmsGate: record.tuning.rmsGate ?? DEFAULT_TUNING.rmsGate,
    frames,
    stats,
  };
}
