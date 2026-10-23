import type { MutedNote, Recording } from "./db";
import type { Frame } from "./notes";
import type { QualityStats } from "./recorder";
import { analysisOptionsFor } from "./recording-profiles";
import type { ReportInput } from "./diagnostics";
import type { NoteItem } from "./recording";
import { covers } from "./recording";
import type { TraceView } from "./trace";
import type { KnobDef, Knobs } from "./melody/knobs";
import { melodySettingFor } from "./melody/settings";
import { resolveKnobs } from "./melody/knobs";
export function knobValueLabel(def: KnobDef, value: Knobs[keyof Knobs]): string {
  if (def.kind === "select")
    return def.options.find((option) => option.value === value)?.label ?? String(value);
  if (def.key.endsWith("Ms")) return `${value} ms`;
  if (def.key === "maxMoveSemitones") return `${value} st`;
  return typeof value === "number" ? String(Number(value.toFixed(3))) : value;
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
    rmsGate: resolveKnobs(melodySettingFor(record).preset, melodySettingFor(record).overrides)
      .levelGate,
    frames,
    stats,
  };
}
