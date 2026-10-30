import { sameEditSnapshot } from "./edit-state";
import type { EditCommit, EditHistory, EditSnapshot } from "./Recording/RecordingEdit.type";

export type EditHistoryEvent =
  | { type: "begin"; label: string }
  | { type: "update"; snapshot: EditSnapshot }
  | { type: "commit"; id: string; createdAt: number }
  | { type: "cancel" | "undo" | "redo" };
export const createEditHistory = (baseline: EditCommit): EditHistory => ({
  commits: [structuredClone(baseline)],
  cursor: 0,
  draft: null,
});
export const currentEditCommit = (h: EditHistory): EditCommit => h.commits[h.cursor]!;
export const displayEditSnapshot = (h: EditHistory): EditSnapshot =>
  h.draft?.snapshot ?? currentEditCommit(h).snapshot;
export const canUndoEdit = (h: EditHistory): boolean => !!h.draft || h.cursor > 0;
export const canRedoEdit = (h: EditHistory): boolean => !h.draft && h.cursor < h.commits.length - 1;
export function reduceEditHistory(h: EditHistory, event: EditHistoryEvent): EditHistory {
  switch (event.type) {
    case "begin":
      return h.draft
        ? h
        : { ...h, draft: { label: event.label, snapshot: currentEditCommit(h).snapshot } };
    case "update":
      return h.draft
        ? { ...h, draft: { ...h.draft, snapshot: structuredClone(event.snapshot) } }
        : h;
    case "cancel":
      return h.draft ? { ...h, draft: null } : h;
    case "undo":
      return h.draft ? { ...h, draft: null } : { ...h, cursor: Math.max(0, h.cursor - 1) };
    case "redo":
      return canRedoEdit(h) ? { ...h, cursor: h.cursor + 1 } : h;
    case "commit": {
      if (!h.draft) return h;
      if (sameEditSnapshot(currentEditCommit(h).snapshot, h.draft.snapshot))
        return { ...h, draft: null };
      const commit = {
        id: event.id,
        createdAt: event.createdAt,
        label: h.draft.label,
        snapshot: structuredClone(h.draft.snapshot),
      };
      const commits = [...h.commits.slice(0, h.cursor + 1), commit];
      return { commits, cursor: commits.length - 1, draft: null };
    }
  }
}
