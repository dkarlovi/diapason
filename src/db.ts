import { databaseTransaction, openDatabase } from "./db-connection";
import type { EditHead } from "./edit-storage";
import type { NoteEdits } from "./note-edits";
// Minimal IndexedDB wrapper for the recordings library. No dependencies.

import type { SoundProfile } from "./recording-profiles";
import type { MelodySetting } from "./melody/settings";
import type { PlaySettings } from "./instruments";
import type { WaveformSummary } from "./waveform";
import type { WavMetadata } from "./wav-metadata";

const STORE = "recordings";

export interface CaptureMeta {
  gain: number;
  peak: number;
  noiseFloor: number;
  rmsGate?: number;
  dspOff: boolean;
}

/** Where a recording was first made: the build and the browser it was recorded in. */
export interface RecordingOrigin {
  build: { version: string; revision: string; source: string; pipeline: number };
  browser: string;
  audioOutput: string;
  midiOutput: string;
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
  editHead?: EditHead;
  noteEdits?: NoteEdits;
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
  /** Set when the recording came from a diapason WAV. */
  imported?: RecordingImport;
}

export interface RecordingImport {
  /** When it was saved into this library. */
  at: number;
  fileName: string;
  /** The file's embedded metadata exactly as it arrived, including fields this build does not
   *  know. Its provenance is written back unchanged when the recording is exported again. */
  metadata: WavMetadata;
}

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

export function putRecording(r: Recording): Promise<unknown> {
  return tx("readwrite", (s) => s.put(r));
}

export function deleteRecording(id: string): Promise<unknown> {
  return databaseTransaction([STORE, "versions", "analysis"], "readwrite", (t, result) => {
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
