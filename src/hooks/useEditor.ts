import { resetPitchEdit, stepPitchEdit, type NoteEdits } from "../note-edits";
import { resolveAnalysisOptions } from "../recording-analysis";
import { useEditorPlayback } from "./useEditorPlayback";
import { useEditorExports } from "./useEditorExports";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import { getRecording, putRecording, deleteRecording, type Recording } from "../db";
import { decodeAudio } from "../codec";
import { analyzeBuffer, qualityStats, type QualityStats } from "../recorder";
import type { Frame } from "../notes";
import { useEditorPlot } from "./useEditorPlot";
import { processRecording, type NoteItem } from "../recording";
import { sameMelodySetting, type MelodySetting } from "../melody/settings";
import { DEFAULT_PRESET, PRESETS, resolveKnobs } from "../melody/knobs";
import { useMelodySettings } from "./useMelodySettings";
import { useTuningHistory } from "./useTuningHistory";
import { recordingPath } from "../router";
import { DEFAULT_PLAY, type PlaySettings } from "../instruments";
import {
  auditionLabel,
  editMarks,
  noteAtPoint,
  selectedSourceItem,
  toggleMuted,
} from "../editor-model";

const NO_MELODY: MelodySetting = { preset: DEFAULT_PRESET, overrides: {}, key: "auto" };
const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function useEditor(id: string) {
  const navigate = useNavigate();
  const [record, setRecord] = useState<Recording | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [draftName, setDraftName] = useState("");
  const [rollHover, setRollHover] = useState(false);
  const [audition, setAudition] = useState<ReturnType<typeof processRecording> | null>(null);
  const [candidate, setCandidate] = useState<{
    id: string;
    label: string;
    applied: boolean;
  } | null>(null);
  const {
    previous: previousTuning,
    remember: rememberTuning,
    clear: clearTuningHistory,
  } = useTuningHistory();

  const recordRef = useRef<Recording | null>(null);
  const pcm = useRef(new Float32Array(0));
  const stats = useRef<QualityStats | null>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const mounted = useRef(false);

  const replaceRecord = useCallback(
    (next: Recording) => {
      rememberTuning(recordRef.current, next);
      recordRef.current = next;
      setRecord(next);
    },
    [rememberTuning],
  );

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
  const appliedItems = processed?.items ?? [];
  const notes = useMemo(() => processed?.notes ?? [], [processed]);
  const interpretation = processed?.interpretation ?? null;
  const melody = processed?.settings.melody ?? NO_MELODY;
  const grid = interpretation?.knobs.grid ?? 0;

  const {
    playing,
    position,
    externalOutput,
    togglePlayback,
    previewNote,
    previewSequence,
    previewId,
    stopPlayback,
  } = useEditorPlayback({ recordingId: id, recordRef, pcmRef: pcm, notes });
  const previewMelody = useCallback(
    (change: Partial<MelodySetting>, previewId: string) => {
      const current = recordRef.current;
      if (!current) return;
      const target = { ...melody, ...change };
      const result = processRecording({ ...current, melody: target }, frames);
      setAudition(result);
      setCandidate({
        id: previewId,
        label:
          auditionLabel(previewId, result.settings.melody, result.interpretation.key.chosen) ??
          "Melody",
        applied: previewId.startsWith("knob-")
          ? JSON.stringify(resolveKnobs(melody.preset, melody.overrides)) ===
            JSON.stringify(resolveKnobs(target.preset, target.overrides))
          : sameMelodySetting(melody, target),
      });
      previewSequence(result.notes, previewId);
    },
    [frames, previewSequence, melody],
  );
  const showingPreview = /^(preset|key|knob)-/.test(previewId ?? "");
  const displayed = showingPreview ? audition : processed;
  const items = displayed?.items ?? appliedItems;
  const displayNotes = displayed?.notes ?? notes;
  const selectedItem = selected === null ? undefined : selectedSourceItem(items, selected);
  const activeCandidate = candidate?.id === previewId ? candidate : null;
  const previewLabel = activeCandidate?.label ?? null;
  const selectNote = useCallback(
    (item: NoteItem) => {
      rollRef.current?.focus({ preventScroll: true });
      if (showingPreview) return;
      setSelected((item.source.start + item.source.end) / 2);
      previewNote(item.note);
    },
    [previewNote, showingPreview],
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
  const {
    logRef,
    reportText,
    copyStatus,
    downloadMidi,
    downloadWav,
    downloadJson,
    downloadLog,
    copyLog,
  } = useEditorExports({ recordingId: id, recordRef, pcmRef: pcm, frames, statsRef: stats });

  const muted = useMemo(() => items.filter((item) => item.muted).map((item) => item.note), [items]);
  const { edited, origins } = useMemo(() => editMarks(items, selectedItem), [items, selectedItem]);
  const displayGrid = displayed?.interpretation.knobs.grid ?? grid;
  const viewport = useEditorPlot({
    record,
    frames,
    notes: displayNotes,
    muted,
    edited,
    origins,
    grid: displayGrid,
    position,
    traceRef,
    rollRef,
  });
  const rollView = viewport.view;

  const persist = useCallback((next: Recording) => {
    void putRecording(next);
  }, []);
  const undoTuning = () => {
    const current = recordRef.current;
    if (!current || previousTuning?.id !== current.id) return;
    stopPlayback();
    flushMelody();
    const next = { ...current };
    if (previousTuning.melody) next.melody = previousTuning.melody;
    else delete next.melody;
    if (previousTuning.play) next.play = previousTuning.play;
    else delete next.play;
    replaceRecord(next);
    clearTuningHistory();
    persist(next);
  };
  const auditionRef = useRef(false);
  auditionRef.current = showingPreview;
  const commitEdits = (noteEdits: NoteEdits) => {
    const current = recordRef.current;
    if (!current || auditionRef.current) return;
    stopPlayback();
    const next = { ...current, noteEdits };
    replaceRecord(next);
    persist(next);
  };
  const currentSelected = () => {
    const current = recordRef.current;
    return current && selected !== null
      ? selectedSourceItem(processRecording(current, frames).items, selected)
      : undefined;
  };
  const shiftSelectedPitch = (delta: -1 | 1) => {
    if (auditionRef.current) return;
    const item = currentSelected();
    if (!item || !recordRef.current) return;
    const midi = item.note.midi + delta;
    if (midi < 0 || midi > 127) return;
    commitEdits(
      stepPitchEdit(recordRef.current.noteEdits, item.source, midi, item.automatic.midi, uid()),
    );
  };
  const resetSelectedPitch = () => {
    if (auditionRef.current) return;
    const item = currentSelected();
    if (item && recordRef.current && item.editState.axes.includes("pitch"))
      commitEdits(resetPitchEdit(recordRef.current.noteEdits, item.source));
  };
  const resetAllNoteEdits = () => {
    if (auditionRef.current || !recordRef.current?.noteEdits?.pitch.length) return;
    if (confirm("Reset all note edits, including inactive edits?"))
      commitEdits({ version: 1, pitch: [] });
  };
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
    const copy = {
      ...current,
      ...(current.noteEdits ? { noteEdits: structuredClone(current.noteEdits) } : {}),
      id: uid(),
      name: `${current.name} (copy)`,
      createdAt: Date.now(),
    };
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
      if (!record) return null;
      const rect = event.currentTarget.getBoundingClientRect();
      return noteAtPoint(items, rollView, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height,
      });
    },
    [items, rollView, record],
  );

  const muteNote = useCallback(
    (item: NoteItem) => {
      const current = recordRef.current;
      if (!current) return;
      stopPlayback();
      const next = { ...current, muted: toggleMuted(current.muted ?? [], item) };
      replaceRecord(next);
      persist(next);
    },
    [stopPlayback, replaceRecord, persist],
  );
  const clickRoll = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      const item = noteAt(event);
      if (!item) {
        setSelected(null);
        return;
      }
      if (event.ctrlKey || event.metaKey) muteNote(item);
      else selectNote(item);
    },
    [noteAt, muteNote, selectNote],
  );

  const moveRoll = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => setRollHover(!!noteAt(event)),
    [noteAt],
  );

  return {
    record,
    selectedPitchEdited: selectedItem?.editState.axes.includes("pitch") ?? false,
    canEditPitch: !showingPreview,
    shiftSelectedPitch,
    resetSelectedPitch,
    resetAllNoteEdits,
    inactivePitchEditCount:
      processed?.editCoverage.filter((edit) => edit.status !== "active").length ?? 0,
    displayNotes,
    previewLabel,
    previewApplied: activeCandidate?.applied ?? false,
    canUndoTuning: previousTuning?.id === record?.id && !!record,
    undoTuning,
    stopPlayback,
    viewport,
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
    previewPlay: (settings: PlaySettings, id: string, label: string) => {
      setCandidate({
        id,
        label,
        applied: settings.instrument === play.instrument && settings.octave === play.octave,
      });
      previewSequence(notes, id, undefined, 0, settings);
    },
    selectedNote: selectedItem?.note ?? null,
    selectedNoteId: selectedItem?.id,
    selectedMuted: selectedItem?.muted ?? false,
    clearSelection: () => setSelected(null),
    muteSelected: () => {
      if (selectedItem) muteNote(selectedItem);
    },
    previewContext,
    selectNote,
    items,
    play,
    notesLabel: `${displayNotes.length} notes${muted.length ? ` · ${muted.length} muted` : ""} · ${previewLabel ?? PRESETS[melody.preset].label}${displayGrid ? " · grid on" : " · performed timing"}`,
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
    downloadLog,
    copyLog,
  };
}
