import type { MutedNote, Recording } from "./db";
import { midiToName, type Frame } from "./notes";
import type { QualityStats } from "./recorder";
import { analysisOptionsFor } from "./recording-profiles";
import type { ReportInput } from "./diagnostics";
import type { NoteItem } from "./recording";
import { covers } from "./recording";
import { traceHorizontalPadding, type TraceView } from "./trace";
import type { KnobDef, Knobs } from "./melody/knobs";
import { melodySettingFor } from "./melody/settings";
import { keyName, type Key } from "./melody/key";
import type { MelodySetting } from "./melody/settings";
import { KNOB_DEFS, PRESETS, resolveKnobs } from "./melody/knobs";
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
  view: Pick<TraceView, "tMin" | "tMax" | "midiMin" | "midiMax" | "inset">,
  point: RollPoint,
): NoteItem | null {
  if (!point.width || !point.height) return null;
  const padding = traceHorizontalPadding(point.width, view.inset);
  const t =
    view.tMin +
    ((point.x - padding.left) / (point.width - padding.left - padding.right)) *
      (view.tMax - view.tMin);
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

/**
 * Whether a point grabs the selected note. The target is at least `minTarget` pixels
 * tall so thin notes stay easy to grab by touch.
 */
export function hitsSelectedNote(
  item: NoteItem,
  view: Pick<TraceView, "tMin" | "tMax" | "midiMin" | "midiMax" | "inset" | "noteHeight">,
  point: RollPoint,
  minTarget = 24,
): boolean {
  if (!point.width || !point.height) return false;
  const padding = traceHorizontalPadding(point.width, view.inset);
  const span = view.tMax - view.tMin || 1;
  const xOf = (t: number) =>
    padding.left + ((t - view.tMin) / span) * (point.width - padding.left - padding.right);
  const semitone = point.height / (view.midiMax - view.midiMin || 1);
  const center = (view.midiMax - item.note.midi) * semitone;
  const half = Math.max(semitone * (view.noteHeight ?? 1), minTarget) / 2;
  const { start, duration } = item.note;
  return (
    point.x >= xOf(start) - 4 &&
    point.x <= xOf(start + duration) + 4 &&
    Math.abs(point.y - center) <= half
  );
}

/** The pitch a vertical drag of `dy` pixels lands on, snapped to semitones. */
export function draggedPitch(from: number, dy: number, semitonePixels: number): number {
  return Math.max(0, Math.min(127, from - Math.round(dy / (semitonePixels || 1))));
}

/** Items with the selected note shown at a dragged pitch, before the edit is saved. */
export function withDraftPitch(
  items: NoteItem[],
  target: NoteItem | undefined,
  midi: number | null,
): NoteItem[] {
  if (!target || midi === null) return items;
  const changed = midi !== target.automatic.midi;
  return items.map((item) =>
    item === target
      ? {
          ...item,
          note: { ...item.note, midi, name: midiToName(midi) },
          editState: {
            ...item.editState,
            axes: changed ? ["pitch"] : [],
            differingAxes: changed ? ["pitch"] : [],
          },
        }
      : item,
  );
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
  const melody = melodySettingFor(record);
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
    rmsGate: resolveKnobs(melody.preset, melody.overrides).levelGate,
    frames,
    stats,
  };
}

export function auditionLabel(id: string, melody: MelodySetting, key: Key | null): string | null {
  if (id.startsWith("preset-")) return PRESETS[melody.preset].label;
  if (id.startsWith("key-")) return key ? `Key ${keyName(key)}` : "Key Auto";
  if (id.startsWith("knob-")) {
    const key = id.split("-")[1] as keyof Knobs;
    const def = KNOB_DEFS.find((def) => def.key === key);
    if (def)
      return `${def.label}: ${knobValueLabel(def, resolveKnobs(melody.preset, melody.overrides)[key])}`;
  }
  return null;
}

export function selectedSourceItem(items: readonly NoteItem[], t: number): NoteItem | undefined {
  return items.find((item) => item.source.start <= t && t < item.source.end);
}

/** Notes drawn as edited, and the automatic origins of edits that changed something. */
export function editMarks(items: readonly NoteItem[], selected: NoteItem | undefined) {
  return {
    edited: items.filter((item) => item.editState.axes.length).map((item) => item.note),
    origins: items
      .filter((item) => item.editState.differingAxes.length)
      .map((item) => ({ from: item.automatic, to: item.note, emphasis: item === selected })),
  };
}
