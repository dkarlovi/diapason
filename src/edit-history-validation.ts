import { validateEditSnapshot } from "./edit-snapshot-validation";
import type { EditCommit, EditHistory } from "./Recording/RecordingEdit.type";

export function validateEditCommit(value: unknown, duration: number): asserts value is EditCommit {
  const commit = value as EditCommit | null;
  if (
    !commit ||
    typeof commit.id !== "string" ||
    !commit.id ||
    typeof commit.label !== "string" ||
    !Number.isFinite(commit.createdAt)
  )
    throw new Error("Invalid editing history.");
  validateEditSnapshot(commit.snapshot, duration);
}
export function validateEditHistory(value: unknown, duration: number): EditHistory {
  const history = value as EditHistory | null;
  if (
    !history ||
    !Array.isArray(history.commits) ||
    !history.commits.length ||
    !Number.isInteger(history.cursor) ||
    history.cursor < 0 ||
    history.cursor >= history.commits.length
  )
    throw new Error("Invalid editing history.");
  for (const commit of history.commits) validateEditCommit(commit, duration);
  if (new Set(history.commits.map((c) => c.id)).size !== history.commits.length)
    throw new Error("Invalid editing history.");
  if (history.draft !== null) {
    if (!history.draft || typeof history.draft.label !== "string")
      throw new Error("Invalid editing history.");
    validateEditSnapshot(history.draft.snapshot, duration);
  }
  return structuredClone(history);
}
