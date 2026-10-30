import { useCallback, useEffect, useRef, useState } from "react";
import type { Recording } from "../Recording/Recording.type";
import { getRecording } from "../Recording/Recording.storage";
import { recordingPath } from "../router";
import { readRecordingPackage, restoreRecordingPackage } from "../recording-package";
import { insertImportedRecording } from "../recording-import-storage";
import type {
  ReadRecordingPackage,
  TuneImportMode,
  ImportDisposition,
} from "../Recording/RecordingPackage.type";
import { recordingFromPortableTune, TUNE_LIMITS } from "../portable-tune";
import { decodeTuneMidi } from "../tune-midi";
import { tuneFromFragment } from "../tune-url";
import type { Notice } from "./useNotice";
import type { PortableTune } from "../Tune/PortableTune.type";

export interface ImportCandidate {
  file: string;
  record?: Recording;
  tune?: PortableTune;
  existing?: Recording;
  error?: string;
  package?: ReadRecordingPackage;
  tuneMode?: TuneImportMode;
  disposition?: ImportDisposition;
}
export const importable = (candidates: readonly ImportCandidate[]) =>
  candidates.filter(
    (c) => (c.record || c.tune) && (!c.existing || c.disposition === "copy") && !c.error,
  );
async function inspect(file: File): Promise<ImportCandidate> {
  try {
    if (/\.midi?$/i.test(file.name) || ["audio/midi", "audio/x-midi"].includes(file.type)) {
      if (file.size > TUNE_LIMITS.encoded * 2) throw new Error("This MIDI file is too large.");
      return {
        file: file.name,
        tune: await decodeTuneMidi(new Uint8Array(await file.arrayBuffer())),
      };
    }
    const input = await readRecordingPackage(await file.arrayBuffer());
    const record = await restoreRecordingPackage(input, file.name, "restore");
    const existing = await getRecording(record.id);
    return {
      file: file.name,
      record,
      package: input,
      tuneMode: input.metadata.schemaVersion === 2 ? "restore" : "fresh",
      disposition: "original",
      ...(existing ? { existing } : {}),
    };
  } catch (error) {
    return { file: file.name, error: error instanceof Error ? error.message : String(error) };
  }
}
async function saveCandidate(candidate: ImportCandidate): Promise<Recording> {
  const now = Date.now();
  const record = candidate.tune
    ? recordingFromPortableTune(candidate.tune, crypto.randomUUID(), now)
    : candidate.package
      ? await restoreRecordingPackage(
          candidate.package,
          candidate.file,
          candidate.tuneMode ?? "restore",
        )
      : { ...candidate.record!, imported: { ...candidate.record!.imported!, at: now } };
  return insertImportedRecording(record, candidate.disposition ?? "original");
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
    setBusy(true);
    const records: Recording[] = [];
    try {
      for (const candidate of selected) {
        records.push(await saveCandidate(candidate));
        setCandidates((current) => current?.filter((c) => c !== candidate) ?? null);
      }
      setCandidates(null);
      showNotice(importedNotice(records));
    } catch (error) {
      const failed = selected[records.length];
      if (failed?.record && failed.disposition !== "copy") {
        const existing = await getRecording(failed.record.id).catch(() => undefined);
        if (existing)
          setCandidates(
            (current) => current?.map((c) => (c === failed ? { ...c, existing } : c)) ?? null,
          );
      }
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
  const setCandidateOptions = useCallback(
    (index: number, options: { tuneMode?: TuneImportMode; disposition?: ImportDisposition }) => {
      if (!saving.current)
        setCandidates(
          (current) =>
            current?.map((candidate, i) =>
              i === index ? { ...candidate, ...options } : candidate,
            ) ?? null,
        );
    },
    [],
  );
  return {
    candidates,
    busy,
    offer,
    offerFiles: offer,
    offerUrl,
    confirm,
    cancel,
    setCandidateOptions,
  };
}
