import type { SourceRange } from "../Editing/NoteEdits.type";
import type { NoteEvent } from "../Melody/Notes";

export interface NoteItem {
  source: SourceRange;
  automatic: NoteEvent;
  editState: { ids: string[]; axes: ("pitch" | "bend")[]; differingAxes: ("pitch" | "bend")[] };
  id: number;
  raw: NoteEvent;
  note: NoteEvent;
  muted: boolean;
  fixedSource?: boolean;
}
