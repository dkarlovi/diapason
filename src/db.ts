// Minimal IndexedDB wrapper for the recordings library. No dependencies.

import type { SoundProfile } from "./recording-profiles";
import type { MelodySetting } from "./melody/settings";
import type { PlaySettings } from "./instruments";
import type { WaveformSummary } from "./waveform";

const DB_NAME = "diapason";
const DB_VERSION = 1;
const STORE = "recordings";

export interface CaptureMeta {
  gain: number;
  peak: number;
  noiseFloor: number;
  rmsGate?: number;
  dspOff: boolean;
}

/** A note the user switched off. Anchored to the midpoint of the raw (unquantized) note
 *  rather than an index, so it still finds "its" note after re-tuning re-segments the recording. */
export interface MutedNote {
  t: number;
  midi: number;
}

export interface QuantizeSetting {
  on: boolean;
  /** Grid divisions per beat (see quantize.ts). */
  subdivision: number;
}

export interface Recording {
  source?: { profileId: string; analysis: SoundProfile["analysis"] };
  id: string;
  name: string;
  createdAt: number;
  sampleRate: number;
  durationSec: number;
  bpm: number;
  beatsPerBar: number;
  /** Gzipped Int16 PCM (see codec.ts). Audio t=0 is the downbeat. */
  audio: Blob;
  waveform?: WaveformSummary;
  capture: CaptureMeta;
  melody?: MelodySetting;
  /** Legacy fields are read only to migrate older saved recordings. */
  tuning?: Partial<{
    rmsGate: number;
    clarityThreshold: number;
    minDurationSec: number;
    silenceGapSec: number;
    medianWindow: number;
    changeDebounceSec: number;
    hysteresisSemitones: number;
  }>;
  muted?: MutedNote[];
  quantize?: QuantizeSetting;
  /** How ▶ MIDI sounds for this recording (playback only; the .mid is unaffected). */
  play?: PlaySettings;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
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

export function putRecording(r: Recording): Promise<unknown> {
  return tx("readwrite", (s) => s.put(r));
}

export function deleteRecording(id: string): Promise<unknown> {
  return tx("readwrite", (s) => s.delete(id));
}

/** Merge in one transaction so backfill cannot overwrite edits or resurrect deletions. */
export async function saveWaveform(
  id: string,
  waveform: WaveformSummary,
): Promise<WaveformSummary | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    let saved: WaveformSummary | undefined;
    const request = store.get(id) as IDBRequest<Recording | undefined>;
    request.onsuccess = () => {
      const record = request.result;
      if (!record) return;
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
