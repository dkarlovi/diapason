import { useCallback, useRef, useState } from "react";
import { getRecording, putRecording, type Recording } from "../db";
import { recordingFromTaggedWav } from "../wav-metadata";
import { useNotice } from "./useNotice";

/** One dropped or picked file, as the import popover shows it. */
export interface ImportCandidate {
  file: string;
  record?: Recording;
  /** The same recording, already in the library; it is never overwritten. */
  existing?: Recording;
  error?: string;
}

async function inspect(file: File): Promise<ImportCandidate> {
  try {
    const record = await recordingFromTaggedWav(await file.arrayBuffer(), file.name);
    const existing = await getRecording(record.id);
    return existing ? { file: file.name, record, existing } : { file: file.name, record };
  } catch (error) {
    return { file: file.name, error: (error as Error).message };
  }
}

export const importable = (candidates: readonly ImportCandidate[]) =>
  candidates.filter((candidate) => candidate.record && !candidate.existing);

/** Reads files into candidates for review; nothing is saved until `confirm`. */
export function useWavImport(onImported: () => Promise<void>) {
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [notice, setNotice] = useNotice();
  const request = useRef(0);

  const offer = useCallback(async (files: readonly File[]) => {
    const token = ++request.current;
    const inspected: ImportCandidate[] = [];
    for (const file of files) inspected.push(await inspect(file));
    if (token === request.current) setCandidates(inspected);
  }, []);

  const cancel = useCallback(() => {
    request.current++;
    setCandidates(null);
  }, []);

  const confirm = useCallback(async () => {
    const records = importable(candidates ?? []).map((candidate) => candidate.record!);
    cancel();
    let saved = 0;
    try {
      for (const record of records) {
        // Stamp the moment it enters the library, not when the file was read.
        await putRecording({ ...record, imported: { ...record.imported!, at: Date.now() } });
        saved++;
      }
      setNotice({
        kind: "success",
        message: saved === 1 ? `Imported “${records[0]!.name}”` : `Imported ${saved} recordings`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: `Saved ${saved} of ${records.length} recordings: ${(error as Error).message}`,
      });
    } finally {
      await onImported();
    }
  }, [candidates, cancel, onImported, setNotice]);

  return { candidates, notice, offer, confirm, cancel };
}
