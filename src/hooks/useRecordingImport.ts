import { useCallback, useEffect, useRef, useState } from "react";
import { getRecording, putRecording, type Recording } from "../db";
import { recordingPath } from "../router";
import { recordingFromTaggedWav } from "../wav-metadata";
import { recordingFromPortableTune, TUNE_LIMITS, type PortableTune } from "../portable-tune";
import { decodeTuneMidi } from "../tune-midi";
import { tuneFromFragment } from "../tune-url";
import type { Notice } from "./useNotice";
export interface ImportCandidate {
  file: string;
  record?: Recording;
  tune?: PortableTune;
  existing?: Recording;
  error?: string;
}
export const importable = (candidates: readonly ImportCandidate[]) =>
  candidates.filter((c) => (c.record || c.tune) && !c.existing && !c.error);
async function inspect(file: File): Promise<ImportCandidate> {
  try {
    if (/\.midi?$/i.test(file.name) || ["audio/midi", "audio/x-midi"].includes(file.type)) {
      if (file.size > TUNE_LIMITS.encoded * 2) throw new Error("This MIDI file is too large.");
      return {
        file: file.name,
        tune: await decodeTuneMidi(new Uint8Array(await file.arrayBuffer())),
      };
    }
    const record = await recordingFromTaggedWav(await file.arrayBuffer(), file.name);
    const existing = await getRecording(record.id);
    return existing ? { file: file.name, record, existing } : { file: file.name, record };
  } catch (error) {
    return { file: file.name, error: error instanceof Error ? error.message : String(error) };
  }
}
async function saveCandidate(candidate: ImportCandidate): Promise<Recording> {
  const now = Date.now();
  const record = candidate.tune
    ? recordingFromPortableTune(candidate.tune, crypto.randomUUID(), now)
    : { ...candidate.record!, imported: { ...candidate.record!.imported!, at: now } };
  await putRecording(record);
  return record;
}
function importedNotice(records: Recording[]): Notice {
  if (records.length === 1)
    return {
      kind: "success",
      action: { label: "Open", to: recordingPath(records[0]!.id) },
      message: `Imported “${records[0]!.name}”`,
    };
  return { kind: "success", message: `Imported ${records.length} recordings` };
}
/** Inspection is read-only. Only confirm allocates local IDs and persists candidates. */
export function useRecordingImport(
  onImported: () => Promise<void>,
  showNotice: (notice: Notice | null) => void,
) {
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef(0),
    saving = useRef(false);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  const offerCandidates = useCallback(async (read: () => Promise<ImportCandidate[]>) => {
    if (saving.current) return;
    const token = ++request.current;
    setBusy(true);
    setCandidates(null);
    try {
      const next = await read();
      if (token === request.current) setCandidates(next);
    } catch (error) {
      if (token === request.current)
        setCandidates([
          { file: "Shared tune", error: error instanceof Error ? error.message : String(error) },
        ]);
    } finally {
      if (token === request.current) setBusy(false);
    }
  }, []);
  const offer = useCallback(
    (files: readonly File[]) =>
      offerCandidates(async () => {
        const inspected: ImportCandidate[] = [];
        for (const file of files) inspected.push(await inspect(file));
        return inspected;
      }),
    [offerCandidates],
  );
  const offerUrl = useCallback(
    (fragment: string) =>
      offerCandidates(async () => {
        const tune = await tuneFromFragment(fragment);
        return tune ? [{ file: "Shared tune", tune }] : [];
      }),
    [offerCandidates],
  );
  const cancel = useCallback(() => {
    request.current++;
    setCandidates(null);
    if (!saving.current) setBusy(false);
  }, []);
  const confirm = useCallback(async () => {
    if (saving.current) return;
    const selected = importable(candidates ?? []);
    if (!selected.length) return;
    saving.current = true;
    request.current++;
    setCandidates(null);
    setBusy(true);
    const records: Recording[] = [];
    try {
      for (const candidate of selected) records.push(await saveCandidate(candidate));
      showNotice(importedNotice(records));
    } catch (error) {
      showNotice({
        kind: "error",
        message: `Saved ${records.length} of ${selected.length} recordings: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      saving.current = false;
      setBusy(false);
      await onImported();
    }
  }, [candidates, onImported, showNotice]);
  return { candidates, busy, offer, offerFiles: offer, offerUrl, confirm, cancel };
}
