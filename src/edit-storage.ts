import { databaseTransaction } from "./db-connection";
import type { Recording } from "./Recording/Recording.type";
import { validateEditHistory } from "./edit-history-validation";
import { currentEditCommit, type EditHistory } from "./edit-history";
import { sameEditSnapshot } from "./edit-state";
import type { EditCommit } from "./edit-history";
import { applyEditSnapshot } from "./edit-state";
import { EditStorageError } from "./edit-storage-error";
import { validateEditSnapshot } from "./edit-snapshot-validation";
export { EditStorageError, validateEditSnapshot };
export interface EditHead {
  commitId: string;
  revision: number;
}
export interface SavedVersion {
  id: string;
  recordingId: string;
  name: string;
  nameKey: string;
  createdAt: number;
  commit: EditCommit;
}
const invalid = () =>
  new EditStorageError("invalid-version", "This version contains unsupported editing data.");

function checkHead(record: Recording, expected: EditHead | null) {
  const head = record.editHead ?? null;
  if (head?.commitId !== expected?.commitId || head?.revision !== expected?.revision)
    throw new EditStorageError(
      "conflict",
      "This recording changed in another tab. Reload before saving more edits.",
    );
}
function recordingTransaction<T>(
  id: string,
  stores: string[],
  run: (record: Recording, tx: IDBTransaction, result: (value: T) => void) => void,
): Promise<T> {
  let failure: unknown;
  return databaseTransaction<T>(["recordings", ...stores], "readwrite", (tx, result) => {
    const request = tx.objectStore("recordings").get(id) as IDBRequest<Recording | undefined>;
    request.onsuccess = () => {
      try {
        if (!request.result) throw new EditStorageError("missing", "This recording was deleted.");
        run(request.result, tx, result);
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
  }).catch((error: unknown) => {
    if (failure) throw failure;
    if (error instanceof DOMException && error.name === "ConstraintError")
      throw new EditStorageError("duplicate-name", "A version with this name already exists.");
    throw error;
  });
}
export function saveEditCommit(
  id: string,
  commit: EditCommit,
  expectedHead: EditHead | null,
  history?: EditHistory,
): Promise<EditHead> {
  return recordingTransaction(id, [], (record, tx, result) => {
    checkHead(record, expectedHead);
    validateEditSnapshot(commit.snapshot, record.durationSec);
    if (history) {
      validateEditHistory(history, record.durationSec);
      const current = currentEditCommit(history);
      if (
        history.draft ||
        current.id !== commit.id ||
        !sameEditSnapshot(current.snapshot, commit.snapshot)
      )
        throw invalid();
    }
    const head = { commitId: commit.id, revision: (expectedHead?.revision ?? 0) + 1 };
    tx.objectStore("recordings").put({
      ...applyEditSnapshot(record, commit.snapshot),
      editHead: head,
      ...(history ? { editHistory: structuredClone(history) } : {}),
    });
    result(head);
  });
}
export function saveRecordingName(id: string, name: string): Promise<void> {
  return recordingTransaction(id, [], (record, tx, result) => {
    tx.objectStore("recordings").put({ ...record, name });
    result(undefined);
  });
}
export function listVersions(id: string): Promise<SavedVersion[]> {
  return databaseTransaction<SavedVersion[]>(["versions"], "readonly", (tx, result) => {
    const req = tx.objectStore("versions").index("recordingId").getAll(id) as IDBRequest<
      SavedVersion[]
    >;
    req.onsuccess = () => result(req.result.sort((a, b) => b.createdAt - a.createdAt));
  });
}
function normalizedName(name: string) {
  const value = name.trim();
  if (!value) throw new EditStorageError("invalid-version", "Enter a version name.");
  return { name: value, nameKey: value.toLowerCase() };
}
export function saveVersion(version: SavedVersion, expectedHead: EditHead | null): Promise<void> {
  return recordingTransaction(version.recordingId, ["versions"], (record, tx, result) => {
    checkHead(record, expectedHead);
    if (expectedHead?.commitId !== version.commit.id)
      throw new EditStorageError("conflict", "Save the current edits before saving a version.");
    validateEditSnapshot(version.commit.snapshot, record.durationSec);
    tx.objectStore("versions").add({ ...version, ...normalizedName(version.name) });
    result(undefined);
  });
}
function changeVersion(
  id: string,
  versionId: string,
  update: (store: IDBObjectStore, version: SavedVersion) => void,
): Promise<void> {
  return recordingTransaction(id, ["versions"], (_record, tx, result) => {
    const store = tx.objectStore("versions");
    const req = store.get(versionId) as IDBRequest<SavedVersion | undefined>;
    req.onsuccess = () => {
      if (req.result?.recordingId === id) update(store, req.result);
      result(undefined);
    };
  });
}
export function renameVersion(id: string, versionId: string, name: string): Promise<void> {
  let normalized: ReturnType<typeof normalizedName>;
  try {
    normalized = normalizedName(name);
  } catch (error) {
    return Promise.reject(error);
  }
  return changeVersion(id, versionId, (store, version) => store.put({ ...version, ...normalized }));
}
export const deleteVersion = (id: string, versionId: string): Promise<void> =>
  changeVersion(id, versionId, (store) => {
    store.delete(versionId);
  });
