import type { SourceRange, PitchEdit, NoteEdits, PitchEditCoverage } from "./NoteEdits.type";
import { isPitchCurve } from "../Melody/PitchCurve";
import { hasProperties } from "../Encoding/Properties";

/** Half-open coverage in the original analysis timeline, in seconds. */
function validRange(value: unknown, duration: number): value is SourceRange {
  if (!hasProperties(value, "start", "end")) return false;
  const { start, end } = value;
  return (
    typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    start < end &&
    end <= duration
  );
}
const validMidi = (midi: unknown): midi is number =>
  typeof midi === "number" && Number.isInteger(midi) && midi >= 0 && midi <= 127;
export function isNoteEdits(value: unknown, durationSec: number): value is NoteEdits {
  if (!hasProperties(value, "version", "pitch") || !(durationSec >= 0)) return false;
  const layer = value;
  if (layer.version !== 1 || !Array.isArray(layer.pitch)) return false;
  const ids = new Set<string>();
  const pitch: readonly unknown[] = layer.pitch;
  const ranges = collectPitchRanges(pitch, durationSec, ids);
  if (!ranges) return false;
  ranges.sort((a, b) => a.start - b.start);
  if (!ranges.every((scope, i) => i === 0 || scope.start >= ranges[i - 1]!.end)) return false;
  return validBendEdits(layer, durationSec, ids);
}
function collectPitchRanges(
  pitch: readonly unknown[],
  durationSec: number,
  ids: Set<string>,
): SourceRange[] | null {
  const ranges: SourceRange[] = [];
  for (const edit of pitch) {
    if (
      !hasProperties(edit, "id", "midi", "ranges") ||
      typeof edit.id !== "string" ||
      !edit.id.trim() ||
      ids.has(edit.id) ||
      !validMidi(edit.midi) ||
      !Array.isArray(edit.ranges) ||
      !edit.ranges.length
    )
      return null;
    ids.add(edit.id);
    let end = -1;
    const scopes: readonly unknown[] = edit.ranges;
    for (const scope of scopes) {
      if (!validRange(scope, durationSec) || scope.start < end) return null;
      end = scope.end;
      ranges.push(scope);
    }
  }
  return ranges;
}

function assertInputs(edits: NoteEdits | undefined, scope: SourceRange) {
  if (!validRange(scope, Infinity)) throw new Error("Invalid source coverage range");
  if (edits !== undefined && !isNoteEdits(edits, Infinity))
    throw new Error("Invalid saved note edits");
}
function subtract(ranges: readonly SourceRange[], scope: SourceRange): SourceRange[] {
  return ranges.flatMap((range) => {
    if (scope.end <= range.start || scope.start >= range.end) return [{ ...range }];
    return [
      ...(range.start < scope.start ? [{ start: range.start, end: scope.start }] : []),
      ...(range.end > scope.end ? [{ start: scope.end, end: range.end }] : []),
    ];
  });
}
export function resetPitchEdit(edits: NoteEdits | undefined, scope: SourceRange): NoteEdits {
  assertInputs(edits, scope);
  return {
    ...edits,
    version: 1,
    pitch: (edits?.pitch ?? [])
      .map((edit) => ({ ...edit, ranges: subtract(edit.ranges, scope) }))
      .filter((edit) => edit.ranges.length > 0),
  };
}
export function setPitchEdit(
  edits: NoteEdits | undefined,
  scope: SourceRange,
  midi: number,
  id: string,
): NoteEdits {
  assertInputs(edits, scope);
  if (
    !validMidi(midi) ||
    !id.trim() ||
    edits?.pitch.some((edit) => edit.id === id) ||
    edits?.bend?.some((edit) => edit.id === id)
  )
    throw new Error("Invalid pitch or duplicate edit ID");
  const next = resetPitchEdit(edits, scope);
  next.pitch.push({ id, midi, ranges: [{ ...scope }] });
  return next;
}
/** A stepper change: landing back on the detected pitch removes the edit instead of pinning it. */
export function stepPitchEdit(
  edits: NoteEdits | undefined,
  scope: SourceRange,
  midi: number,
  automaticMidi: number,
  id: string,
): NoteEdits {
  return midi === automaticMidi
    ? resetPitchEdit(edits, scope)
    : setPitchEdit(edits, scope, midi, id);
}
export function protectedNoteBoundaries(edits: NoteEdits | undefined): number[] {
  const boundaries = [
    ...new Set(
      edits?.pitch.flatMap((edit) => edit.ranges.flatMap((range) => [range.start, range.end])) ??
        [],
    ),
  ];
  for (const edit of edits?.bend ?? [])
    boundaries.push(edit.segment.source.start, edit.segment.source.end);
  boundaries.sort((a, b) => a - b);
  return [...new Set(boundaries)];
}
export function pitchEditFor(
  edits: NoteEdits | undefined,
  source: SourceRange,
): PitchEdit | undefined {
  assertInputs(edits, source);
  let match: PitchEdit | undefined;
  for (const edit of edits?.pitch ?? [])
    for (const range of edit.ranges) {
      if (range.start >= source.end || range.end <= source.start) continue;
      if (match || range.start > source.start || range.end < source.end)
        throw new Error("Source segment crosses pitch coverage boundary");
      match = edit;
    }
  return match;
}
export function summarizePitchEdits(
  edits: NoteEdits | undefined,
  sources: readonly SourceRange[],
): PitchEditCoverage[] {
  return (edits?.pitch ?? []).map((edit) => {
    let missing = edit.ranges.map((range) => ({ ...range }));
    const represented = sources.some((source) =>
      edit.ranges.some((range) => source.start < range.end && source.end > range.start),
    );
    for (const source of sources) missing = subtract(missing, source);
    return {
      id: edit.id,
      status: !missing.length ? "active" : represented ? "partial" : "inactive",
      missing,
    };
  });
}

function validBendSegment(value: unknown, duration: number): boolean {
  if (!hasProperties(value, "source", "start", "duration", "pitch")) return false;
  if (!validRange(value.source, duration)) return false;
  return (
    typeof value.pitch === "number" &&
    Number.isFinite(value.pitch) &&
    value.pitch >= 0 &&
    value.pitch <= 127 &&
    value.start === value.source.start &&
    typeof value.duration === "number" &&
    Math.abs(value.duration - (value.source.end - value.source.start)) <= 1e-9 &&
    (!("curve" in value) || isPitchCurve(value.curve))
  );
}
function validBendEdits(value: object, duration: number, ids: Set<string>): boolean {
  if (!("bend" in value) || value.bend === undefined) return true;
  if (!Array.isArray(value.bend)) return false;
  const ranges: SourceRange[] = [];
  for (const edit of value.bend) {
    if (
      !hasProperties(edit, "id", "segment", "points") ||
      typeof edit.id !== "string" ||
      !edit.id.trim() ||
      ids.has(edit.id)
    )
      return false;
    if (!validBendSegment(edit.segment, duration) || !isPitchCurve(edit.points)) return false;
    ids.add(edit.id);
    if (!hasProperties(edit.segment, "source") || !validRange(edit.segment.source, duration))
      return false;
    ranges.push(edit.segment.source);
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges.every((range, i) => !i || range.start >= ranges[i - 1]!.end);
}
