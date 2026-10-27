// Existing editor fixtures mock recording I/O; keep their storage boundary consistent.
import { getRecording, putRecording, type Recording } from "../db";
import { applyEditSnapshot } from "../edit-state";
import type { EditCommit } from "../edit-history";
import type { EditHead, SavedVersion } from "../edit-storage";
const records = new Map<string, Recording>();
export const resetEditorStorageDouble = () => records.clear();
export async function saveEditCommit(
  id: string,
  commit: EditCommit,
  expected: EditHead | null,
): Promise<EditHead> {
  const base = records.get(id) ?? (await getRecording(id));
  if (!base) throw new Error("Missing fixture recording");
  const head = { commitId: commit.id, revision: (expected?.revision ?? 0) + 1 };
  const next = { ...applyEditSnapshot(base, commit.snapshot), editHead: head };
  records.set(id, next);
  await putRecording(next);
  return head;
}
export async function saveRecordingName(id: string, name: string): Promise<void> {
  const base = records.get(id) ?? (await getRecording(id));
  if (!base) throw new Error("Missing fixture recording");
  const next = { ...base, name };
  records.set(id, next);
  await putRecording(next);
}
export const listVersions = async (): Promise<SavedVersion[]> => [];
