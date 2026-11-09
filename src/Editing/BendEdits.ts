import { isNoteEdits } from "./NoteEdits";
import { isPitchCurve } from "../Melody/PitchCurve";
import type { BendEdit, NoteEdits, SourceRange } from "./NoteEdits.type";
import type { Segment } from "../Melody/Decode.type";
import type { PitchPoint } from "../Melody/PitchCurve.type";

const overlaps = (a: SourceRange, b: SourceRange) => a.start < b.end && b.start < a.end;

export function bendEditFor(
  edits: NoteEdits | undefined,
  source: SourceRange,
): BendEdit | undefined {
  return edits?.bend?.find(
    (edit) => edit.segment.source.start === source.start && edit.segment.source.end === source.end,
  );
}

export function resetBendEdit(edits: NoteEdits | undefined, source: SourceRange): NoteEdits {
  if (edits && !isNoteEdits(edits, Infinity)) throw new Error("Invalid saved note edits");
  const result: NoteEdits = { ...edits, version: 1, pitch: edits?.pitch ?? [] };
  const remaining = edits?.bend?.filter((edit) => !overlaps(edit.segment.source, source));
  if (remaining?.length) result.bend = remaining;
  else delete result.bend;
  return result;
}

export function setBendEdit(
  edits: NoteEdits | undefined,
  segment: Segment,
  points: PitchPoint[],
  id: string,
): NoteEdits {
  if (!isPitchCurve(points) || !id.trim()) throw new Error("Invalid bend edit");
  const next = resetBendEdit(edits, segment.source);
  next.bend = [
    ...(next.bend ?? []),
    { id, segment: structuredClone(segment), points: structuredClone(points) },
  ];
  if (!isNoteEdits(next, Infinity)) throw new Error("Invalid bend edit");
  return next;
}
