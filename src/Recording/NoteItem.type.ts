import type { SourceRange } from "../note-edits";
import type { NoteEvent } from "../notes";

export interface NoteItem {
  source: SourceRange;
  automatic: NoteEvent;
  editState: { ids: string[]; axes: "pitch"[]; differingAxes: "pitch"[] };
  id: number;
  raw: NoteEvent;
  note: NoteEvent;
  muted: boolean;
  fixedSource?: boolean;
}
