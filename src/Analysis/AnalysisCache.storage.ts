import type { AudioRecording as Recording } from "../Recording/Recording.type";
import { databaseTransaction } from "../Storage/Database";
import { packFrames, unpackFrames } from "./Frame.storage";
import type { Frame } from "../Melody/Notes";
import { resolveAnalysisOptions } from "./RecordingAnalysis";

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
