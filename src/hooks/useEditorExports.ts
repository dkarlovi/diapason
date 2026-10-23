import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Recording } from "../db";
import type { Frame } from "../notes";
import type { QualityStats } from "../recorder";
import { notesToMidi } from "../midi";
import { encodeWav } from "../wav";
import { buildReport, buildReportData } from "../diagnostics";
import { downloadBlob } from "../ui";
import { exportSlug, makeReportInput } from "../editor-model";
import { recordingNotes } from "../recording";

interface Options {
  recordingId: string;
  recordRef: RefObject<Recording | null>;
  pcmRef: RefObject<Float32Array>;
  frames: Frame[];
  statsRef: RefObject<QualityStats | null>;
}

export function useEditorExports({ recordingId, recordRef, pcmRef, frames, statsRef }: Options) {
  const [reportText, setReportText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const logRef = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    setReportText("");
    setCopyStatus("");
    return () => {
      generation.current++;
    };
  }, [recordingId]);

  const filename = useCallback(
    (extension: string) =>
      `${exportSlug(recordRef.current?.name ?? "recording", Date.now())}.${extension}`,
    [recordRef],
  );
  const downloadMidi = useCallback(() => {
    const current = recordRef.current;
    if (current)
      downloadBlob(notesToMidi(recordingNotes(current, frames), { bpm: current.bpm }), filename("mid"));
  }, [filename, frames, recordRef]);
  const downloadWav = useCallback(() => {
    const current = recordRef.current;
    if (current) downloadBlob(encodeWav(pcmRef.current, current.sampleRate), filename("wav"));
  }, [filename, recordRef, pcmRef]);
  const downloadJson = useCallback(() => {
    const current = recordRef.current;
    if (!current || !statsRef.current) return;
    const json = JSON.stringify(
      buildReportData(makeReportInput(current, frames, statsRef.current)),
      null,
      2,
    );
    downloadBlob(new Blob([json], { type: "application/json" }), filename("json"));
  }, [filename, frames, recordRef, statsRef]);
  const copyLog = useCallback(async () => {
    const current = recordRef.current;
    if (!current || !statsRef.current) return;
    const token = generation.current;
    const report = buildReport(makeReportInput(current, frames, statsRef.current));
    setReportText(report);
    try {
      await navigator.clipboard.writeText(report);
      if (token === generation.current) setCopyStatus("copied ✓");
    } catch {
      if (token === generation.current) setCopyStatus("select the text above to copy");
    }
  }, [frames, recordRef, statsRef]);
  useEffect(() => {
    if (copyStatus.startsWith("select")) logRef.current?.select();
  }, [copyStatus]);

  return { logRef, reportText, copyStatus, downloadMidi, downloadWav, downloadJson, copyLog };
}
