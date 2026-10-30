import type { SourceRange } from "../Editing/NoteEdits";
import type { NoteEvent } from "../Melody/Notes";

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
