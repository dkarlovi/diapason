// Existing editor fixtures mock recording I/O; keep their storage boundary consistent.
import { getRecording, putRecording, type Recording } from "../db";
import { applyEditSnapshot } from "../edit-state";
import type { EditCommit, EditHistory } from "../edit-history";
import type { EditHead, SavedVersion } from "../edit-storage";
const records = new Map<string, Recording>();
export const resetEditorStorageDouble = () => records.clear();
async function writeFixtureCommit(
  id: string,
  commit: EditCommit,
  expected: EditHead | null,
  history?: EditHistory,
): Promise<EditHead> {
  const base = records.get(id) ?? (await getRecording(id));
  if (!base) throw new Error("Missing fixture recording");
  const head = { commitId: commit.id, revision: (expected?.revision ?? 0) + 1 };
  const next = {
    ...applyEditSnapshot(base, commit.snapshot),
    editHead: head,
    ...(history ? { editHistory: history } : {}),
  };
  records.set(id, next);
  await putRecording(next);
  return head;
}
async function renameFixtureRecording(id: string, name: string): Promise<void> {
  const base = records.get(id) ?? (await getRecording(id));
  if (!base) throw new Error("Missing fixture recording");
  const next = { ...base, name };
  records.set(id, next);
  await putRecording(next);
}
export const editorStorageDouble = {
  saveEditCommit: writeFixtureCommit,
  saveRecordingName: renameFixtureRecording,
  listVersions: async (): Promise<SavedVersion[]> => [],
};
