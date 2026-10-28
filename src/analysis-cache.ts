import type { Recording } from "./db";
import { databaseTransaction } from "./db-connection";
import type { Frame } from "./notes";
import { resolveAnalysisOptions } from "./recording-analysis";

// Bump whenever pitch.ts or recorder.ts changes the acoustic analysis.
const ANALYSIS_VERSION = 1;
interface StoredAnalysis {
  id: string;
  key: string;
  frames: Float64Array;
}

export function analysisKey(record: Recording, version = ANALYSIS_VERSION): string {
  return JSON.stringify([version, record.sampleRate, resolveAnalysisOptions(record)]);
}

/** Float64 preserves JS numbers exactly, including timestamps used by MIDI/diagnostics. */
export function packFrames(frames: Frame[]): Float64Array<ArrayBuffer> {
  const packed = new Float64Array(frames.length * 4);
  frames.forEach(({ t, freq, clarity, rms }, i) => {
    packed.set([t, freq ?? NaN, clarity, rms], i * 4);
  });
  return packed;
}
export function unpackFrames(packed: Float64Array): Frame[] {
  const frames: Frame[] = [];
  for (let i = 0; i < packed.length; i += 4) {
    const freq = packed[i + 1]!;
    frames.push({
      t: packed[i]!,
      freq: Number.isNaN(freq) ? null : freq,
      clarity: packed[i + 2]!,
      rms: packed[i + 3]!,
    });
  }
  return frames;
}
export async function readAnalysis(record: Recording): Promise<Frame[] | undefined> {
  const saved = await databaseTransaction<StoredAnalysis | undefined>(
    ["analysis"],
    "readonly",
    (tx, result) => {
      const request = tx.objectStore("analysis").get(record.id) as IDBRequest<
        StoredAnalysis | undefined
      >;
      request.onsuccess = () => result(request.result);
    },
  );
  return saved?.key === analysisKey(record) ? unpackFrames(saved.frames) : undefined;
}

/** Check existence and options in the same transaction, including deletion during analysis. */
export async function writeAnalysis(record: Recording, frames: Frame[]): Promise<void> {
  const entry: StoredAnalysis = {
    id: record.id,
    key: analysisKey(record),
    frames: packFrames(frames),
  };
  return databaseTransaction(["recordings", "analysis"], "readwrite", (tx, result) => {
    const request = tx.objectStore("recordings").get(record.id) as IDBRequest<
      Recording | undefined
    >;
    request.onsuccess = () => {
      if (request.result && analysisKey(request.result) === entry.key)
        tx.objectStore("analysis").put(entry);
    };
    result(undefined);
  });
}
