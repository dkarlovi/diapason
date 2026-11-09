import type { MutedNote } from "../Recording/Recording.type";
import { type Frame } from "../Melody/Notes";
import type { QualityStats } from "../Audio/Recorder";
import { analysisOptionsFor } from "../Recording/RecordingProfiles";
import type { ReportInput } from "../Diagnostics/Diagnostics";
import { covers } from "../Recording/Processing";
import { traceHorizontalPadding } from "../Audio/Trace";
import type { TraceView } from "../Audio/Trace.type";
import type { KnobDef, Knobs } from "../Melody/Knobs";
import { melodySettingFor } from "../Melody/Settings";
import { keyName, type Key } from "../Melody/Key";
import { KNOB_DEFS, PRESETS, resolveKnobs } from "../Melody/Knobs";
import type { MelodySetting } from "../Melody/MelodySetting.type";
import { notePitchAt, snapGlide } from "../Melody/PitchCurve";
import type { PitchPoint } from "../Melody/PitchCurve.type";
import type { NoteItem } from "../Recording/NoteItem.type";

export function knobValueLabel(def: KnobDef, value: Knobs[keyof Knobs]): string {
  if (def.key === "glide" && typeof value === "number") {
    const glide = snapGlide(value);
    const label =
      new Map([
        [0, "None"],
        [0.2, "Coarse steps"],
        [0.4, "Fine steps"],
      ]).get(glide) ?? "Smooth";
    return `${label} · ${Math.round(glide * 100)}%`;
  }
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
  let bestDistance = Infinity;
  for (const item of items) {
    const { start, duration } = item.note;
    if (t < start - padT || t > start + duration + padT) continue;
    const distance = Math.abs(midi - notePitchAt(item.note, (t - start) / duration));
    if (distance <= 0.75 && distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
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
  const t =
    view.tMin + ((point.x - padding.left) / (point.width - padding.left - padding.right)) * span;
  const pitch = notePitchAt(item.note, (t - item.note.start) / item.note.duration);
  const center = (view.midiMax - pitch) * semitone;
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

export function toggleMuted(muted: MutedNote[], item: NoteItem): MutedNote[] {
  return item.muted
    ? muted.filter((anchor) =>
        item.fixedSource
          ? !(anchor.t >= item.source.start && anchor.t < item.source.end)
          : !covers(anchor, item.raw),
      )
    : [
        ...muted,
        {
          t: item.fixedSource
            ? (item.source.start + item.source.end) / 2
            : item.raw.start + item.raw.duration / 2,
          midi: item.raw.midi,
        },
      ];
}

export function exportSlug(name: string, now: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `diapason-${base || "recording"}-${now}`;
}

export function makeReportInput(
  record: import("../Recording/Recording.type").AudioRecording,
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

export function auditionLabel(
  id: string,
  melody: MelodySetting,
  selectedKey: Key | null,
): string | null {
  if (id.startsWith("preset-")) return PRESETS[melody.preset].label;
  if (id.startsWith("key-")) return selectedKey ? `Key ${keyName(selectedKey)}` : "Key Auto";
  if (id.startsWith("knob-")) {
    const key = id.split("-")[1];
    const def = KNOB_DEFS.find((candidate) => candidate.key === key);
    if (def)
      return `${def.label}: ${knobValueLabel(def, resolveKnobs(melody.preset, melody.overrides)[def.key])}`;
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

/** The fixed destination is visible but cannot be dragged. */
export function bendHandleAtPoint(
  item: NoteItem,
  points: readonly PitchPoint[],
  view: Pick<TraceView, "tMin" | "tMax" | "midiMin" | "midiMax" | "inset">,
  point: RollPoint,
  minTarget = 24,
): number | null {
  if (!point.width || !point.height) return null;
  const padding = traceHorizontalPadding(point.width, view.inset);
  const width = point.width - padding.left - padding.right;
  let best: number | null = null;
  let nearest = Infinity;
  points.slice(0, -1).forEach((handle, index) => {
    const x =
      padding.left +
      ((item.note.start + handle.position * item.note.duration - view.tMin) /
        (view.tMax - view.tMin || 1)) *
        width;
    const y =
      ((view.midiMax - item.note.midi - handle.offset) / (view.midiMax - view.midiMin || 1)) *
      point.height;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= minTarget / 2 && distance < nearest) {
      best = index;
      nearest = distance;
    }
  });
  return best;
}
