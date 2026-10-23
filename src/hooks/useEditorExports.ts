import { activeOutput } from "../midiout";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { Recording } from "../db";
import type { Frame } from "../notes";
import type { QualityStats } from "../recorder";
import { notesToMidi } from "../midi";
import { encodeWav } from "../wav";
import { buildReport } from "../diagnostics";
import { diagnosticSnapshot } from "../diagnostic-snapshot";
import { downloadBlob } from "../ui";
import { exportSlug, makeReportInput } from "../editor-model";
import { recordingNotes } from "../recording";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
  const reportInput = useCallback(
    (current: Recording, stats: QualityStats) => ({
      ...makeReportInput(current, frames, stats),
      context: {
        browser: navigator.userAgent,
        audioOutput: "unknown",
        midiOutput: activeOutput()?.name ?? "Browser synth",
      },
    }),
    [frames],
  );
  const downloadMidi = useCallback(() => {
    const current = recordRef.current;
    if (!current) return;
    try {
      downloadBlob(
        notesToMidi(recordingNotes(current, frames), { bpm: current.bpm }),
        filename("mid"),
      );
    } catch (error) {
      setCopyStatus(`MIDI export failed: ${errorMessage(error)}`);
    }
  }, [filename, frames, recordRef]);
  const downloadWav = useCallback(() => {
    const current = recordRef.current;
    if (current) downloadBlob(encodeWav(pcmRef.current, current.sampleRate), filename("wav"));
  }, [filename, recordRef, pcmRef]);
  const downloadJson = useCallback(async () => {
    const current = recordRef.current;
    if (!current || !statsRef.current) return;
    const token = generation.current;
    const name = filename("json");
    try {
      const { report } = await diagnosticSnapshot(
        reportInput(current, statsRef.current),
        pcmRef.current,
      );
      if (token !== generation.current) return;
      downloadBlob(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), name);
    } catch {
      if (token === generation.current) setCopyStatus("Diagnostics export failed; please retry.");
    }
  }, [filename, reportInput, recordRef, statsRef, pcmRef]);
  const copyLog = useCallback(async () => {
    const current = recordRef.current;
    if (!current || !statsRef.current) return;
    const token = generation.current;
    let report: string;
    try {
      report = buildReport(reportInput(current, statsRef.current));
    } catch (error) {
      setCopyStatus(`Diagnostics failed: ${errorMessage(error)}`);
      return;
    }
    setReportText(report);
    try {
      await navigator.clipboard.writeText(report);
      if (token === generation.current) setCopyStatus("copied ✓");
    } catch {
      if (token === generation.current) setCopyStatus("select the text above to copy");
    }
  }, [reportInput, recordRef, statsRef]);
  useEffect(() => {
    if (copyStatus.startsWith("select")) logRef.current?.select();
  }, [copyStatus]);

  return { logRef, reportText, copyStatus, downloadMidi, downloadWav, downloadJson, copyLog };
}
