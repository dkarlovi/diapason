import { analysisOptionsFor } from "../recording-profiles";
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

export type Playing = { id: string; kind: "audio" | "midi" } | null;

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useLibrary() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [storage, setStorage] = useState("");
  const [playing, setPlaying] = useState<Playing>(null);
  const playingRef = useRef<Playing>(null);
  const decoded = useRef(
    new Map<string, { pcm: Float32Array; frames?: Frame[]; analysisKey?: string }>(),
  );
  const playback = useRef<Playback | null>(null);
  const raf = useRef(0);
  const request = useRef(0);
  const mounted = useRef(false);

  const stopPlayback = useCallback(() => {
    request.current++;
    playback.current?.stop();
    playback.current = null;
    playingRef.current = null;
    if (mounted.current) setPlaying(null);
    cancelAnimationFrame(raf.current);
  }, []);

  const reload = useCallback(async () => {
    stopPlayback();
    const records = await allRecordings();
    if (!mounted.current) return;
    setRecordings(records);
    const estimate = await storageEstimate();
    if (!mounted.current) return;
    setStorage(
      estimate
        ? `${records.length} recording(s) · ~${(estimate.usage / 1e6).toFixed(1)} MB used`
        : `${records.length} recording(s)`,
    );
  }, [stopPlayback]);

  useEffect(() => {
    mounted.current = true;
    void reload();
    const offOutput = onOutputChange(stopPlayback);
    return () => {
      mounted.current = false;
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
      const token = request.current;
      const current = { id: record.id, kind };
      playingRef.current = current;
      setPlaying(current);

      let audio = decoded.current.get(record.id);
      if (!audio) {
        audio = { pcm: await decodeAudio(record.audio) };
        decoded.current.set(record.id, audio);
      }
      const options = { ...analysisOptionsFor(record), maskBpm: record.bpm };
      const analysisKey = JSON.stringify(options);
      if (kind === "midi" && (!audio.frames || audio.analysisKey !== analysisKey)) {
        audio.frames = analyzeBuffer(audio.pcm, record.sampleRate, options);
        audio.analysisKey = analysisKey;
      }
      if (!mounted.current || token !== request.current) return;

      playback.current =
        kind === "audio"
          ? playPcm(audio.pcm, record.sampleRate)
          : playNotes(recordingNotes(record, audio.frames!), record.durationSec, record.play);
      const tick = () => {
        if (playback.current?.position() == null) return stopPlayback();
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [stopPlayback],
  );

  const duplicate = useCallback(
    async (id: string) => {
      const record = await getRecording(id);
      if (!record) return;
      const copy: Recording = {
        ...record,
        id: uid(),
        name: `${record.name} (copy)`,
        createdAt: Date.now(),
      };
      await putRecording(copy);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (record: Recording) => {
      if (!confirm(`Delete “${record.name}”? This can't be undone.`)) return;
      stopPlayback();
      decoded.current.delete(record.id);
      await deleteRecording(record.id);
      await reload();
    },
    [reload, stopPlayback],
  );

  return { recordings, storage, playing, togglePlay, duplicate, remove };
}
