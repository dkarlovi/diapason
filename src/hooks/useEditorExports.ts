import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Notice } from "./useNotice";
import { activeOutput } from "../midiout";
import type { Recording } from "../db";
import type { Frame } from "../notes";
import { encodeTuneMidi } from "../tune-midi";
import { createPortableTune } from "../portable-tune";
import { captureRecordingPackage, encodeRecordingPackage } from "../recording-package";
import type { ExportContext } from "../wav-metadata";
import { downloadBlob } from "../ui";
import { exportSlug } from "../editor-model";

const exportContext = (): ExportContext => ({
  browser: navigator.userAgent,
  audioOutput: "unknown",
  midiOutput: activeOutput()?.name ?? "Browser synth",
});
async function exportBlob(
  kind: "MIDI" | "WAV",
  current: Recording,
  pcm: Float32Array,
  frames: Frame[],
): Promise<Blob | null> {
  if (kind === "MIDI") return encodeTuneMidi(createPortableTune(current, frames));
  if (current.noteSource) return null;
  return encodeRecordingPackage(
    captureRecordingPackage(current, pcm, frames, exportContext(), Date.now()),
  );
}
interface Options {
  showNotice: (notice: Notice | null) => void;
  recordingId: string;
  recordRef: RefObject<Recording | null>;
  pcmRef: RefObject<Float32Array>;
  frames: Frame[];
  canExport: boolean;
  beforeExport(): Promise<void>;
}
export function useEditorExports({
  recordingId,
  recordRef,
  pcmRef,
  frames,
  canExport,
  showNotice,
  beforeExport,
}: Options) {
  const generation = useRef(0);
  const latest = useRef({ frames, canExport });
  latest.current = { frames, canExport };
  useEffect(
    () => () => {
      generation.current++;
    },
    [recordingId],
  );
  const run = useCallback(
    async (kind: "MIDI" | "WAV") => {
      if (!latest.current.canExport) return;
      const token = generation.current;
      try {
        await beforeExport();
        const current = recordRef.current;
        if (
          !current ||
          current.id !== recordingId ||
          token !== generation.current ||
          !latest.current.canExport
        )
          return;
        const name = `${exportSlug(current.name, Date.now())}.${kind === "MIDI" ? "mid" : "wav"}`;
        const blob = await exportBlob(kind, current, pcmRef.current, latest.current.frames);
        if (blob && token === generation.current && recordRef.current?.id === recordingId)
          downloadBlob(blob, name);
      } catch (error) {
        if (token === generation.current)
          showNotice({
            kind: "error",
            message: `${kind} export failed: ${error instanceof Error ? error.message : String(error)}`,
          });
      }
    },
    [beforeExport, recordingId, recordRef, pcmRef, showNotice],
  );
  const downloadMidi = useCallback(() => run("MIDI"), [run]);
  const downloadWav = useCallback(() => run("WAV"), [run]);
  return { downloadMidi, downloadWav };
}
