import { resolveAnalysisOptions } from "../recording-analysis";
import { useEditorPlayback } from "./useEditorPlayback";
import { useEditorExports } from "./useEditorExports";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { getRecording, putRecording, deleteRecording, type Recording } from "../db";
import { decodeAudio } from "../codec";
import { analyzeBuffer, qualityStats, type QualityStats } from "../recorder";
import type { Frame } from "../notes";
import { drawTrace, autoRange, type TraceView } from "../trace";
import { processRecording, previewNotes, covers, type NoteItem } from "../recording";
import type { MelodySetting } from "../melody/settings";
import { DEFAULT_PRESET, PRESETS } from "../melody/knobs";
import { useMelodySettings } from "./useMelodySettings";
import { recordingPath } from "../router";
import { DEFAULT_PLAY, type PlaySettings } from "../instruments";
import { noteAtPoint, toggleMuted } from "../editor-model";

const NO_MELODY: MelodySetting = { preset: DEFAULT_PRESET, overrides: {}, key: "auto" };
const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function useEditor(id: string) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<Recording | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [draftName, setDraftName] = useState("");
  const [rollHover, setRollHover] = useState(false);

  const recordRef = useRef<Recording | null>(null);
  const pcm = useRef(new Float32Array(0));
  const stats = useRef<QualityStats | null>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<{ t: number; midi: number } | null>(null);
  const mounted = useRef(false);

  const replaceRecord = useCallback((next: Recording) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

  const {
    flush: flushMelody,
    applyPreset,
    changeKnob,
    resetKnob,
    changeKey,
  } = useMelodySettings(recordRef, replaceRecord);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    recordRef.current = null;
    setRecord(null);
    setFrames([]);
    setSelected(null);
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
      const analyzed = analyzeBuffer(decoded, found.sampleRate, resolveAnalysisOptions(found));
      stats.current = qualityStats(analyzed, decoded);
      setFrames(analyzed);
      replaceRecord(found);
      setDraftName(found.name);
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      flushMelody();
    };
  }, [flushMelody, id, navigate, replaceRecord]);

  const play = record?.play ?? DEFAULT_PLAY;
  const processed = useMemo(
    () => (record ? processRecording(record, frames) : null),
    [record, frames],
  );
  const items = processed?.items ?? [];
  const notes = useMemo(() => processed?.notes ?? [], [processed]);
  const interpretation = processed?.interpretation ?? null;
  const melody = processed?.settings.melody ?? NO_MELODY;
  const grid = interpretation?.knobs.grid ?? 0;
  const selectedItem = selected ? items.find((item) => covers(selected, item.raw)) : undefined;
  const {
    playing,
    position,
    externalOutput,
    togglePlayback,
    previewNote,
    previewSequence,
    previewId,
  } = useEditorPlayback({ recordingId: id, recordRef, pcmRef: pcm, notes });
  const previewMelody = useCallback(
    (change: Partial<MelodySetting>, previewId: string) => {
      const current = recordRef.current;
      if (current) previewSequence(previewNotes(current, frames, change), previewId);
    },
    [frames, previewSequence],
  );
  const selectNote = useCallback(
    (item: NoteItem) => {
      setSelected({ t: item.raw.start + item.raw.duration / 2, midi: item.raw.midi });
      previewNote(item.note);
    },
    [previewNote],
  );
  const previewContext = () => {
    if (!selectedItem) return;
    const index = items.indexOf(selectedItem);
    const phrase = items
      .slice(Math.max(0, index - 1), index + 3)
      .filter((item) => !item.muted)
      .map((item) => item.note);
    if (!phrase.length) return;
    const start = phrase[0]!.start;
    previewSequence(
      phrase.map((note) => ({ ...note, start: note.start - start })),
      `note-${selectedItem.note.start}`,
      phrase.at(-1)!.start + phrase.at(-1)!.duration - start,
      start,
    );
  };
  const { logRef, reportText, copyStatus, downloadMidi, downloadWav, downloadJson, copyLog } =
    useEditorExports({ recordingId: id, recordRef, pcmRef: pcm, frames, statsRef: stats });

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
            beats: { ...beats, subdivision: grid || 1 },
            notes,
            muted,
          }
        : null,
    [baseView, beats, grid, notes, muted],
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
    if (mounted.current) navigate(recordingPath(copy.id));
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
      selectNote(item);
    },
    [noteAt, persist, replaceRecord, selectNote],
  );

  const moveRoll = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => setRollHover(!!noteAt(event)),
    [noteAt],
  );

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
    melody,
    interpretation,
    previewId,
    previewMelody,
    selectedNote: selectedItem?.note ?? null,
    previewContext,
    selectNote,
    items,
    play,
    notesLabel: `${notes.length} notes${muted.length ? ` · ${muted.length} muted` : ""} · ${PRESETS[melody.preset].label}${grid ? " · grid on" : " · performed timing"}`,
    meta: record
      ? `${record.bpm} BPM · ${record.beatsPerBar}/4 · ${record.durationSec.toFixed(1)}s · ${record.sampleRate} Hz${record.capture.dspOff ? "" : " · ⚠ DSP was on"}`
      : "",
    playing,
    position,
    rollHover,
    externalOutput,
    applyPreset,
    changeKnob,
    resetKnob,
    changeKey,
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
