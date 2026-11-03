// IndexedDB storage for the recordings library.
import { databaseTransaction, openDatabase } from "../Storage/Database";
import { publishStoredChange, subscribeStoredChanges } from "../Storage/StoredChanges";
import type { AudioRecording, Recording } from "./Recording.type";
import type { WaveformSummary } from "../Audio/Waveform";

export function isAudioRecording(record: Recording): record is AudioRecording {
  return record.noteSource === undefined;
}

const STORE = "recordings";

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return databaseTransaction([STORE], mode, (t, result) => {
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => result(req.result);
  });
}

export function allRecordings(): Promise<Recording[]> {
  return tx<Recording[]>("readonly", (s) => s.getAll() as IDBRequest<Recording[]>).then((rs) =>
    rs.sort((a, b) => b.createdAt - a.createdAt),
  );
}

export function getRecording(id: string): Promise<Recording | undefined> {
  return tx<Recording | undefined>(
    "readonly",
    (s) => s.get(id) as IDBRequest<Recording | undefined>,
  );
}

/** Calls back whenever any tab, frame, or this document stores a change to the recording. */
export function subscribeRecording(id: string, listener: () => void): () => void {
  return subscribeStoredChanges((change) => {
    if (change.kind === "recording" && change.id === id) listener();
  });
}

export async function putRecording(r: Recording): Promise<unknown> {
  const key = await tx("readwrite", (s) => s.put(r));
  publishStoredChange({ kind: "recording", id: r.id });
  return key;
}

export async function deleteRecording(id: string): Promise<void> {
  await databaseTransaction([STORE, "versions", "analysis"], "readwrite", (t, result) => {
    t.objectStore(STORE).delete(id);
    t.objectStore("analysis").delete(id);
    const cursor = t.objectStore("versions").index("recordingId").openCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (row) {
        row.delete();
        row.continue();
      }
    };
    result(undefined);
  });
  publishStoredChange({ kind: "recording", id });
}

/** Merge in one transaction so backfill cannot overwrite edits or resurrect deletions. */
export async function saveWaveform(
  id: string,
  waveform: WaveformSummary,
): Promise<WaveformSummary | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    let saved: WaveformSummary | undefined;
    const request = store.get(id) as IDBRequest<Recording | undefined>;
    request.onsuccess = () => {
      const record = request.result;
      if (!record || !isAudioRecording(record)) return;
      saved = record.waveform ?? waveform;
      if (!record.waveform) store.put({ ...record, waveform });
    };
    transaction.oncomplete = () => resolve(saved);
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

/** Best-effort storage usage, for a usage indicator. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
