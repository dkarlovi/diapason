import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { getRecording, putRecording, deleteRecording, type Recording } from "../db";
import { decodeAudio } from "../codec";
import { analyzeBuffer, qualityStats, type QualityStats } from "../recorder";
import type { Frame } from "../notes";
import { drawTrace, autoRange, type TraceView } from "../trace";
import { takeItems, DEFAULT_QUANTIZE } from "../take";
import { notesToMidi } from "../midi";
import { encodeWav } from "../wav";
import { buildReport, buildReportData } from "../diagnostics";
import { DEFAULT_TUNING, saveLastTuning, type Tuning } from "../tuning";
import { downloadBlob } from "../ui";
import { takePath } from "../router";
import { playPcm, playNotes, type Playback } from "../playback";
import { DEFAULT_PLAY, type PlaySettings } from "../instruments";
import { onOutputChange, activeOutput } from "../midiout";
import {
  exportSlug,
  makeReportInput,
  noteAtPoint,
  toggleMuted,
  updateTuning,
} from "../editor-model";

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const gridLabels: Record<number, string> = {
  1: "1/4 notes",
  2: "1/8 notes",
  4: "1/16 notes",
  3: "1/8 triplets",
};

export function useEditor(id: string) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<Recording | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [draftName, setDraftName] = useState("");
  const [playing, setPlaying] = useState<"audio" | "midi" | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [rollHover, setRollHover] = useState(false);
  const [externalOutput, setExternalOutput] = useState(() => !!activeOutput());
  const [reportText, setReportText] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  const recordRef = useRef<Recording | null>(null);
  const pcm = useRef(new Float32Array(0));
  const stats = useRef<QualityStats | null>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const playback = useRef<Playback | null>(null);
  const preview = useRef<Playback | null>(null);
  const raf = useRef(0);
  const persistTimer = useRef(0);
  const tuningDirty = useRef(false);
  const mounted = useRef(false);
  const playingRef = useRef<"audio" | "midi" | null>(null);

  const replaceRecord = useCallback((next: Recording) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const stopPlayback = useCallback(() => {
    playback.current?.stop();
    playback.current = null;
    playingRef.current = null;
    cancelAnimationFrame(raf.current);
    if (mounted.current) {
      setPlaying(null);
      setPosition(null);
    }
  }, []);

  const flushTuning = useCallback(() => {
    if (!tuningDirty.current) return;
    tuningDirty.current = false;
    persistTimer.current = 0;
    const latest = recordRef.current;
    if (!latest) return;
    void putRecording(latest);
    saveLastTuning(latest.tuning as Tuning);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    recordRef.current = null;
    setRecord(null);
    setFrames([]);
    setReportText("");
    setCopyStatus("");
    void (async () => {
      const found = await getRecording(id);
      if (cancelled) return;
      if (!found) {
        navigate("/");
        return;
      }
      const decoded = await decodeAudio(found.audio);
      if (cancelled) return;
      pcm.current = decoded;
      const analyzed = analyzeBuffer(decoded, found.sampleRate, { maskBpm: found.bpm });
      stats.current = qualityStats(analyzed, decoded);
      setFrames(analyzed);
      replaceRecord(found);
      setDraftName(found.name);
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      window.clearTimeout(persistTimer.current);
      flushTuning();
      stopPlayback();
      preview.current?.stop();
      preview.current = null;
    };
  }, [flushTuning, id, navigate, replaceRecord, stopPlayback]);

  useEffect(
    () =>
      onOutputChange(() => {
        stopPlayback();
        setExternalOutput(!!activeOutput());
      }),
    [stopPlayback],
  );

  const quantize = record?.quantize ?? DEFAULT_QUANTIZE;
  const play = record?.play ?? DEFAULT_PLAY;
  const tuning = { ...DEFAULT_TUNING, ...record?.tuning };
  const items = useMemo(() => (record ? takeItems(record, frames) : []), [record, frames]);
  const notes = useMemo(
    () => items.filter((item) => !item.muted).map((item) => item.note),
    [items],
  );
  const muted = useMemo(() => items.filter((item) => item.muted).map((item) => item.note), [items]);
  const baseView = useMemo(
    () => (record ? { tMin: 0, tMax: record.durationSec, ...autoRange(frames) } : null),
    [record, frames],
  );
  const beats = useMemo(
    () => (record ? { bpm: record.bpm, beatsPerBar: record.beatsPerBar } : null),
    [record],
  );
  const rollView: TraceView | null = useMemo(
    () =>
      baseView && beats
        ? {
            ...baseView,
            beats: { ...beats, subdivision: quantize.on ? quantize.subdivision : 1 },
            notes,
            muted,
          }
        : null,
    [baseView, beats, quantize.on, quantize.subdivision, notes, muted],
  );

  useEffect(() => {
    if (!record || !baseView || !beats || !rollView) return;
    const draw = () => {
      if (traceRef.current) drawTrace(traceRef.current, frames, { ...baseView, beats });
      if (rollRef.current) drawTrace(rollRef.current, frames, rollView);
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [record, frames, baseView, beats, rollView]);

  const persist = useCallback((next: Recording) => {
    void putRecording(next);
  }, []);
  const changeTuning = useCallback(
    (key: keyof Tuning, value: number) => {
      const current = recordRef.current;
      if (!current) return;
      const next = {
        ...current,
        tuning: updateTuning({ ...DEFAULT_TUNING, ...current.tuning }, key, value),
      };
      replaceRecord(next);
      tuningDirty.current = true;
      window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(flushTuning, 300);
    },
    [flushTuning, replaceRecord],
  );

  const resetTuning = useCallback(
    (key?: keyof Tuning) => {
      const current = recordRef.current;
      if (!current) return;
      const next = {
        ...current,
        tuning: key
          ? { ...DEFAULT_TUNING, ...current.tuning, [key]: DEFAULT_TUNING[key] }
          : { ...DEFAULT_TUNING },
      };
      replaceRecord(next);
      tuningDirty.current = true;
      window.clearTimeout(persistTimer.current);
      persistTimer.current = window.setTimeout(flushTuning, 300);
    },
    [flushTuning, replaceRecord],
  );

  const changeQuantize = useCallback(
    (on: boolean, subdivision: number) => {
      const current = recordRef.current;
      if (!current) return;
      const next = { ...current, quantize: { on, subdivision } };
      replaceRecord(next);
      persist(next);
    },
    [replaceRecord, persist],
  );

  const changePlay = useCallback(
    (settings: PlaySettings) => {
      const current = recordRef.current;
      if (!current) return;
      const next = { ...current, play: settings };
      replaceRecord(next);
      persist(next);
    },
    [replaceRecord, persist],
  );

  const commitName = useCallback(() => {
    const current = recordRef.current;
    if (!current) return;
    const name = draftName.trim() || "Untitled";
    setDraftName(name);
    const next = { ...current, name };
    replaceRecord(next);
    persist(next);
  }, [draftName, persist, replaceRecord]);

  const duplicate = useCallback(async () => {
    const current = recordRef.current;
    if (!current) return;
    const copy = { ...current, id: uid(), name: `${current.name} (copy)`, createdAt: Date.now() };
    await putRecording(copy);
    if (mounted.current) navigate(takePath(copy.id));
  }, [navigate]);

  const remove = useCallback(async () => {
    const current = recordRef.current;
    if (!current || !confirm(`Delete “${current.name}”?`)) return;
    await deleteRecording(current.id);
    if (mounted.current) navigate("/");
  }, [navigate]);

  const noteAt = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (!rollView) return null;
      const rect = event.currentTarget.getBoundingClientRect();
      return noteAtPoint(items, rollView, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [items, rollView],
  );

  const clickRoll = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      const item = noteAt(event);
      const current = recordRef.current;
      if (!item || !current) return;
      if (event.ctrlKey || event.metaKey) {
        const next = { ...current, muted: toggleMuted(current.muted ?? [], item) };
        replaceRecord(next);
        persist(next);
        return;
      }
      preview.current?.stop();
      preview.current = playNotes([{ ...item.note, start: 0 }], item.note.duration, current.play);
    },
    [noteAt, persist, replaceRecord],
  );

  const moveRoll = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => setRollHover(!!noteAt(event)),
    [noteAt],
  );

  const togglePlayback = useCallback(
    (kind: "audio" | "midi") => {
      const current = recordRef.current;
      const wasThis = playingRef.current === kind;
      stopPlayback();
      if (!current || wasThis) return;
      playback.current =
        kind === "audio"
          ? playPcm(pcm.current, current.sampleRate)
          : playNotes(notes, current.durationSec, current.play);
      playingRef.current = kind;
      setPlaying(kind);
      const tick = () => {
        const value = playback.current?.position();
        if (value == null) {
          stopPlayback();
          return;
        }
        setPosition(value);
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    },
    [notes, stopPlayback],
  );

  const filename = useCallback(
    (extension: string) =>
      `${exportSlug(recordRef.current?.name ?? "take", Date.now())}.${extension}`,
    [],
  );
  const downloadMidi = useCallback(() => {
    const current = recordRef.current;
    if (current) downloadBlob(notesToMidi(notes, { bpm: current.bpm }), filename("mid"));
  }, [filename, notes]);
  const downloadWav = useCallback(() => {
    const current = recordRef.current;
    if (current) downloadBlob(encodeWav(pcm.current, current.sampleRate), filename("wav"));
  }, [filename]);
  const downloadJson = useCallback(() => {
    const current = recordRef.current;
    if (!current || !stats.current) return;
    const json = JSON.stringify(
      buildReportData(makeReportInput(current, frames, stats.current)),
      null,
      2,
    );
    downloadBlob(new Blob([json], { type: "application/json" }), filename("json"));
  }, [filename, frames]);
  const copyLog = useCallback(async () => {
    const current = recordRef.current;
    if (!current || !stats.current) return;
    const report = buildReport(makeReportInput(current, frames, stats.current));
    setReportText(report);
    try {
      await navigator.clipboard.writeText(report);
      if (mounted.current) setCopyStatus("copied ✓");
    } catch {
      if (mounted.current) setCopyStatus("select the text above to copy");
    }
  }, [frames]);
  useEffect(() => {
    if (copyStatus.startsWith("select")) logRef.current?.select();
  }, [copyStatus]);

  return {
    record,
    draftName,
    setDraftName,
    commitName,
    traceRef,
    rollRef,
    logRef,
    reportText,
    copyStatus,
    quantize,
    play,
    tuning,
    notesLabel: `${notes.length} notes${muted.length ? ` · ${muted.length} muted` : ""} · ${quantize.on ? (gridLabels[quantize.subdivision] ?? "grid") : "not quantized"}`,
    meta: record
      ? `${record.bpm} BPM · ${record.beatsPerBar}/4 · ${record.durationSec.toFixed(1)}s · ${record.sampleRate} Hz${record.capture.dspOff ? "" : " · ⚠ DSP was on"}`
      : "",
    playing,
    position,
    rollHover,
    externalOutput,
    changeTuning,
    resetTuning,
    changeQuantize,
    changePlay,
    duplicate,
    remove,
    clickRoll,
    moveRoll,
    togglePlayback,
    downloadMidi,
    downloadWav,
    downloadJson,
    copyLog,
  };
}
