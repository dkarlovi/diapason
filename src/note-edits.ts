/** Half-open coverage in the original analysis timeline, in seconds. */
export interface SourceRange {
  start: number;
  end: number;
}
export interface PitchEdit {
  id: string;
  ranges: SourceRange[];
  midi: number;
}
export interface NoteEdits {
  version: 1;
  pitch: PitchEdit[];
}
function validRange(value: unknown, duration: number): value is SourceRange {
  if (!value || typeof value !== "object") return false;
  const { start, end } = value as SourceRange;
  return (
    Number.isFinite(start) && Number.isFinite(end) && start >= 0 && start < end && end <= duration
  );
}
const validMidi = (midi: number) => Number.isInteger(midi) && midi >= 0 && midi <= 127;
export function isNoteEdits(value: unknown, durationSec: number): value is NoteEdits {
  if (!value || typeof value !== "object" || !(durationSec >= 0)) return false;
  const layer = value as NoteEdits;
  if (layer.version !== 1 || !Array.isArray(layer.pitch)) return false;
  const ids = new Set<string>();
  const ranges: SourceRange[] = [];
  for (const edit of layer.pitch) {
    if (
      !edit ||
      typeof edit.id !== "string" ||
      !edit.id.trim() ||
      ids.has(edit.id) ||
      !validMidi(edit.midi) ||
      !Array.isArray(edit.ranges) ||
      !edit.ranges.length
    )
      return false;
    ids.add(edit.id);
    let end = -1;
    for (const scope of edit.ranges) {
      if (!validRange(scope, durationSec) || scope.start < end) return false;
      end = scope.end;
      ranges.push(scope);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges.every((scope, i) => i === 0 || scope.start >= ranges[i - 1]!.end);
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
  if (!validMidi(midi) || !id.trim() || edits?.pitch.some((edit) => edit.id === id))
    throw new Error("Invalid pitch or duplicate edit ID");
  const next = resetPitchEdit(edits, scope);
  next.pitch.push({ id, midi, ranges: [{ ...scope }] });
  return next;
}
export function protectedNoteBoundaries(edits: NoteEdits | undefined): number[] {
  return [
    ...new Set(
      edits?.pitch.flatMap((edit) => edit.ranges.flatMap((range) => [range.start, range.end])) ??
        [],
    ),
  ].sort((a, b) => a - b);
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
export interface PitchEditCoverage {
  id: string;
  status: "active" | "partial" | "inactive";
  missing: SourceRange[];
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
