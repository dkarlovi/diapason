import { useNotice, type Notice } from "./useNotice";
import { flushEditorSaves, stopEditorSaves } from "../editor-save-queue";
import { resolveAnalysisOptions } from "../recording-analysis";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  allRecordings,
  deleteRecording,
  getRecording,
  putRecording,
  storageEstimate,
  type Recording,
} from "../db";
import { decodeAudio } from "../codec";
import { analyzeBuffer } from "../recorder";
import { playPcm, playNotes, type Playback } from "../playback";
import { recordingNotes } from "../recording";
import { onOutputChange } from "../midiout";
import type { Frame } from "../notes";
import { useLibraryRecordings } from "./useWaveformBackfill";

const playbackLabels = { audio: "original audio", midi: "MIDI" };
const clearPlaybackNotice = (notice: Notice | null) => (notice?.kind === "info" ? null : notice);

export type Playing = { id: string; kind: "audio" | "midi" } | null;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useLibrary() {
  const [notice, setNotice] = useNotice();
  const dismissNotice = useCallback(() => setNotice(null), [setNotice]);
  const [recordings, setRecordings] = useLibraryRecordings();
  const [storage, setStorage] = useState("");
  const [playing, setPlaying] = useState<Playing>(null);
  const playingRef = useRef<Playing>(null);
  const decoded = useRef(
    new Map<string, { pcm: Float32Array; frames?: Frame[]; analysisKey?: string }>(),
  );
  const playback = useRef<Playback | null>(null);
  const transport = useRef({ raf: 0, request: 0, mounted: false });

  const stopPlayback = useCallback(() => {
    transport.current.request++;
    playback.current?.stop();
    playback.current = null;
    playingRef.current = null;
    if (transport.current.mounted) {
      setPlaying(null);
      setNotice(clearPlaybackNotice);
    }
    cancelAnimationFrame(transport.current.raf);
  }, [setNotice]);

  const reload = useCallback(async () => {
    stopPlayback();
    await flushEditorSaves().catch(() => {});
    const records = await allRecordings();
    if (!transport.current.mounted) return;
    setRecordings(records);
    const estimate = await storageEstimate();
    if (!transport.current.mounted) return;
    setStorage(
      estimate
        ? `${records.length} recording(s) · ~${(estimate.usage / 1e6).toFixed(1)} MB used`
        : `${records.length} recording(s)`,
    );
  }, [stopPlayback]);

  useEffect(() => {
    transport.current.mounted = true;
    void reload();
    const offOutput = onOutputChange(stopPlayback);
    return () => {
      transport.current.mounted = false;
      stopPlayback();
      offOutput();
      decoded.current.clear();
    };
  }, [reload, stopPlayback]);

  const togglePlay = useCallback(
    async (record: Recording, kind: "audio" | "midi") => {
      const wasThis = playingRef.current?.id === record.id && playingRef.current.kind === kind;
      stopPlayback();
      if (wasThis) return;
      const token = transport.current.request;
      const current = { id: record.id, kind };
      playingRef.current = current;
      setPlaying(current);

      try {
        let audio = decoded.current.get(record.id);
        if (!audio) {
          audio = { pcm: await decodeAudio(record.audio) };
          decoded.current.set(record.id, audio);
        }
        const options = resolveAnalysisOptions(record);
        const analysisKey = JSON.stringify(options);
        if (kind === "midi" && (!audio.frames || audio.analysisKey !== analysisKey)) {
          audio.frames = analyzeBuffer(audio.pcm, record.sampleRate, options);
          audio.analysisKey = analysisKey;
        }
        if (!transport.current.mounted || token !== transport.current.request) return;

        playback.current =
          kind === "audio"
            ? playPcm(audio.pcm, record.sampleRate)
            : playNotes(recordingNotes(record, audio.frames!), record.durationSec, record.play);
        const tick = () => {
          if (playback.current?.position() == null) return stopPlayback();
          transport.current.raf = requestAnimationFrame(tick);
        };
        transport.current.raf = requestAnimationFrame(tick);
        setNotice({
          kind: "info",
          message: `Playing ${playbackLabels[kind]}: ${record.name}`,
        });
      } catch (error) {
        if (!transport.current.mounted || token !== transport.current.request) return;
        stopPlayback();
        setNotice({ kind: "error", message: `Playback failed: ${(error as Error).message}` });
      }
    },
    [stopPlayback, setNotice],
  );

  const duplicate = useCallback(
    async (id: string) => {
      try {
        await flushEditorSaves(id);
        const record = await getRecording(id);
        if (!record) return;
        const copy: Recording = {
          ...record,
          id: uid(),
          name: `${record.name} (copy)`,
          createdAt: Date.now(),
        };
        delete copy.editHead;
        await putRecording(copy);
        await reload();
        setNotice({ kind: "success", message: `Duplicated “${record.name}”` });
      } catch (error) {
        setNotice({
          kind: "error",
          message: `Could not duplicate recording: ${(error as Error).message}`,
        });
      }
    },
    [reload, setNotice],
  );

  const remove = useCallback(
    async (record: Recording) => {
      if (!confirm(`Delete “${record.name}”? This can't be undone.`)) return;
      try {
        stopPlayback();
        decoded.current.delete(record.id);
        await stopEditorSaves(record.id);
        await deleteRecording(record.id);
        await reload();
        setNotice({ kind: "success", message: `Deleted “${record.name}”` });
      } catch (error) {
        setNotice({
          kind: "error",
          message: `Could not delete recording: ${(error as Error).message}`,
        });
      }
    },
    [reload, stopPlayback, setNotice],
  );

  return {
    notice,
    showNotice: setNotice,
    dismissNotice,
    recordings,
    storage,
    playing,
    reload,
    togglePlay,
    duplicate,
    remove,
  };
}
