import { compareSavedMelody } from "../recording-package-comparison";
import type { AdHocTuneSession } from "./useAdHocTune";
import { createPortableTune } from "../portable-tune";
import { useSaveTune } from "./useSaveTune";
import { useLocation } from "react-router";
import { useStudioMode } from "./useStudioMode";
import { useTuneShare } from "./useTuneShare";
import {
  loadEditorRecording,
  decodeEditorRecording,
  analyzeEditorRecording,
} from "../editor-source";
import {
  constrainMelodyChange,
  knobAvailability,
  recordingCapabilities,
} from "../recording-capabilities";
import { useEditorVersions } from "./useEditorVersions";
import { applyEditSnapshot } from "../edit-state";
import { validateEditSnapshot } from "../edit-storage";
import { captureEditSnapshot } from "../edit-state";
import { KNOB_DEFS, isKnobs, type Knobs } from "../melody/knobs";
import { resetPitchEdit, stepPitchEdit, type NoteEdits } from "../note-edits";
import { useAnalysisStatus } from "./useAnalysisStatus";
import { useEditorPlayback } from "./useEditorPlayback";
import { useEditorExports } from "./useEditorExports";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useStudioNavigate } from "./useStudioMode";
import { putRecording, deleteRecording, type Recording } from "../db";
import type { QualityStats } from "../recorder";
import type { Frame } from "../notes";
import { useEditorPlot } from "./useEditorPlot";
import { rollPoint, useNoteDrag } from "./useNoteDrag";
import { processRecording, type NoteItem } from "../recording";
import { melodySettingFor, sameMelodySetting, type MelodySetting } from "../melody/settings";
import { DEFAULT_PRESET, PRESETS, resolveKnobs } from "../melody/knobs";
import { useMelodySettings } from "./useMelodySettings";
import { useEditHistory } from "./useEditHistory";
import { saveRecordingName } from "../edit-storage";
import { getEditorSaveStatuses, subscribeEditorSaves, stopEditorSaves } from "../editor-save-queue";
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
export function useEditor(id: string, session?: AdHocTuneSession) {
  const { tuneLocked } = useStudioMode();
  const location = useLocation();
  const saving = useRef(false);
  const navigate = useStudioNavigate();
  const [record, setRecord] = useState<Recording | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [analysisReady, setAnalysisReady] = useState(false);
  const analysis = useAnalysisStatus(record);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [rollHover, setRollHover] = useState<"note" | "drag" | null>(null);
  const [audition, setAudition] = useState<ReturnType<typeof processRecording> | null>(null);
  const [candidate, setCandidate] = useState<{
    id: string;
    label: string;
    applied: boolean;
  } | null>(null);
  const recordRef = useRef<Recording | null>(null);
  const pcm = useRef(new Float32Array(0));
  const stats = useRef<QualityStats | null>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const rollRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const mounted = useRef(false);

  const replaceRecord = useCallback((next: Recording) => {
    recordRef.current = next;
    setRecord(next);
  }, []);

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
    notice,
    showNotice,
    dismissNotice,
    playhead,
    externalOutput,
    togglePlayback,
    previewNote,
    previewSequence,
    previewId,
    stopPlayback,
  } = useEditorPlayback({ recordingId: id, recordRef, pcmRef: pcm, notes });
  const history = useEditHistory({ record, replaceRecord, beforeChange: stopPlayback, session });
  const finishSession = () => {
    history.finish();
    stopPlayback();
  };
  const { savingTune, saveTune } = useSaveTune({
    session,
    ready: analysisReady,
    finish: finishSession,
    notify: showNotice,
    saving,
  });
  useEffect(() => {
    const warning: unknown = location.state?.tuneSaveWarning;
    if (typeof warning === "string") showNotice({ kind: "info", message: warning });
  }, [location.state, showNotice]);
  const sharing = useTuneShare(
    showNotice,
    history.flush,
    session
      ? async () => {
          const current = recordRef.current!;
          return createPortableTune(
            { ...current, name: session.getDraft().name.trim() || "Untitled" },
            [],
          );
        }
      : undefined,
  );
  const { applyPreset, changeKnob, resetKnob, changeKey } = useMelodySettings(
    recordRef,
    history.change,
  );
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let loading = false;
    let blocked = false;
    recordRef.current = null;
    setRecord(null);
    setFrames([]);
    setAnalysisReady(false);
    setLoadError(null);
    pcm.current = new Float32Array(0);
    stats.current = null;
    setSelected(null);
    const load = async () => {
      if (cancelled || loading) return;
      loading = true;
      blocked = false;
      setLoadError(null);
      try {
        const found = await loadEditorRecording(id, session);
        if (cancelled) return;
        if (!found) {
          if (tuneLocked) throw new Error("This recording is no longer available.");
          navigate("/");
          return;
        }
        const decoded = await decodeEditorRecording(found);
        if (cancelled) return;
        pcm.current = decoded;
        replaceRecord(found);
        setDraftName(found.name);
        const { frames: analyzed, stats: analyzedStats } = await analyzeEditorRecording(
          found,
          decoded,
          loadAttempt > 0,
        );
        if (cancelled) return;
        stats.current = analyzedStats;
        setFrames(analyzed);
        setAnalysisReady(true);
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        blocked = true;
        /* Retry in the shell can resume this load once pending saves recover. */
      } finally {
        loading = false;
      }
    };
    const unsubscribe = subscribeEditorSaves(() => {
      if (!blocked || cancelled) return;
      const pending = getEditorSaveStatuses().some(
        (status) => status.recordingId === id && status.state !== "saved",
      );
      if (!pending) void load();
    });
    void load();
    return () => {
      unsubscribe();
      cancelled = true;
      mounted.current = false;
    };
  }, [id, navigate, replaceRecord, loadAttempt, session, tuneLocked]);
  useEffect(() => {
    if (analysisReady && analysis.cacheWarning)
      showNotice({
        kind: "error",
        message: `Analysis ready. Could not save cache: ${analysis.cacheWarning}. Reopening may analyze again.`,
      });
  }, [analysisReady, analysis.cacheWarning, showNotice]);
  const previewMelody = useCallback(
    (change: Partial<MelodySetting>, previewId: string) => {
      const current = recordRef.current;
      if (!current) return;
      const target = constrainMelodyChange(current, { ...melody, ...change });
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
  const versions = useEditorVersions({
    recordingId: id,
    session,
    history,
    beforeAction: stopPlayback,
    preview(version) {
      const current = recordRef.current;
      if (!current) return;
      validateEditSnapshot(version.commit.snapshot, current.durationSec);
      const target = applyEditSnapshot(current, version.commit.snapshot);
      const result = processRecording(target, frames);
      const previewId = `version-${version.id}`;
      setAudition(result);
      setCandidate({ id: previewId, label: version.name, applied: false });
      previewSequence(result.notes, previewId, undefined, 0, target.play ?? DEFAULT_PLAY);
    },
  });
  const showingPreview = /^(preset|key|knob|version)-/.test(previewId ?? "");
  const displayed = showingPreview ? audition : processed;
  const baseItems = displayed?.items ?? appliedItems;
  const items = baseItems;
  const displayNotes = useMemo(
    () => items.filter((item) => !item.muted).map((item) => item.note),
    [items],
  );
  const selectedItem = selected === null ? undefined : selectedSourceItem(items, selected);
  useEffect(() => {
    if (
      !showingPreview &&
      !history.drafting &&
      selected !== null &&
      !selectedSourceItem(appliedItems, selected)
    )
      setSelected(null);
  }, [showingPreview, history.drafting, selected, appliedItems]);
  const activeCandidate = candidate?.id === previewId ? candidate : null;
  const previewLabel = activeCandidate?.label ?? null;
  const previewApplied = activeCandidate?.applied ?? false;
  const canExport =
    analysisReady && (previewLabel === null || previewApplied) && !versions.busy && !savingTune;
  useEffect(() => {
    if (!playing || (!previewLabel && !previewId)) return;
    showNotice({
      kind: "info",
      message: previewLabel
        ? `Playing preview · ${previewLabel} · ${previewApplied ? "Applied" : "Not applied"}`
        : "Playing note in context",
    });
  }, [playing, previewLabel, previewApplied, previewId, showNotice]);

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
  const { downloadMidi, downloadWav } = useEditorExports({
    canExport,
    beforeExport: history.flush,
    recordingId: id,
    recordRef,
    pcmRef: pcm,
    frames,
    showNotice,
  });

  const importAnalysisMismatch = useMemo(() => {
    const meta = record?.imported?.metadata;
    if (
      !record ||
      !analysisReady ||
      record.imported?.tuneMode !== "restore" ||
      meta?.schemaVersion !== 2
    )
      return false;
    const baseline = processRecording(applyEditSnapshot(record, meta.intent), frames);
    return !compareSavedMelody(meta.evidence, {
      ...meta.evidence,
      stages: { ...meta.evidence.stages, items: baseline.items },
      notes: baseline.notes,
    }).matches;
  }, [record, frames, analysisReady]);

  const muted = useMemo(() => items.filter((item) => item.muted).map((item) => item.note), [items]);
  const { edited, origins } = useMemo(() => editMarks(items, selectedItem), [items, selectedItem]);
  const displayGrid = displayed?.interpretation.knobs.grid ?? grid;
  const claimRef = useRef<(event: PointerEvent) => boolean>(() => false);
  const claimsPointer = useCallback((event: PointerEvent) => claimRef.current(event), []);
  const viewport = useEditorPlot({
    record,
    frames,
    notes: displayNotes,
    muted,
    edited,
    origins,
    grid: displayGrid,
    playhead,
    traceRef,
    rollRef,
    claimsPointer,
  });
  const rollView = viewport.view;

  const auditionRef = useRef(false);
  auditionRef.current = showingPreview;
  const commitEdits = (noteEdits: NoteEdits, label = "Edit pitch") => {
    const current = recordRef.current;
    if (!current || auditionRef.current || saving.current) return;
    stopPlayback();
    history.change(label, (value) => ({ ...value, noteEdits }));
  };
  const currentSelected = () => {
    const current = recordRef.current;
    return current && selected !== null
      ? selectedSourceItem(processRecording(current, frames).items, selected)
      : undefined;
  };
  const setSelectedPitch = (midi: number) => {
    const item = auditionRef.current ? undefined : currentSelected();
    if (!item || !recordRef.current || midi < 0 || midi > 127 || midi === item.note.midi) return;
    commitEdits(
      stepPitchEdit(recordRef.current.noteEdits, item.source, midi, item.automatic.midi, uid()),
    );
  };
  const shiftSelectedPitch = (delta: number) => {
    const item = currentSelected();
    if (item) setSelectedPitch(item.note.midi + delta);
  };
  const knobBaseline = useRef<Recording | null>(null);
  const pitchBaseline = useRef<{ record: Recording; item: NoteItem } | null>(null);
  claimRef.current = useNoteDrag({
    rollRef,
    selected: selectedItem,
    view: rollView,
    enabled: !showingPreview && !savingTune,
    gesture: {
      active: history.drafting,
      begin() {
        history.finish();
        const item = currentSelected(),
          current = recordRef.current;
        if (!item || !current) return;
        pitchBaseline.current = { record: current, item };
        history.begin("Edit pitch");
      },
      update(midi) {
        const baseline = pitchBaseline.current;
        if (!baseline) return;
        const { record: initial, item } = baseline;
        history.update(
          captureEditSnapshot(
            midi === item.note.midi
              ? initial
              : {
                  ...initial,
                  noteEdits: stepPitchEdit(
                    initial.noteEdits,
                    item.source,
                    midi,
                    item.automatic.midi,
                    uid(),
                  ),
                },
          ),
        );
        previewNote({ ...item.note, midi });
      },
      commit: history.commit,
      cancel: history.cancel,
    },
  });
  const resetSelectedPitch = () => {
    if (auditionRef.current) return;
    const item = currentSelected();
    if (item && recordRef.current && item.editState.axes.includes("pitch"))
      commitEdits(resetPitchEdit(recordRef.current.noteEdits, item.source), "Reset pitch");
  };
  const resetAllNoteEdits = () => {
    if (auditionRef.current || !recordRef.current?.noteEdits?.pitch.length) return;
    if (confirm("Reset all note edits, including inactive edits?"))
      commitEdits({ version: 1, pitch: [] }, "Reset all note edits");
  };
  const changePlay = useCallback(
    (settings: PlaySettings) => {
      const current = recordRef.current;
      if (!current) return;
      history.change("Change playback sound", (value) => ({ ...value, play: settings }));
    },
    [history.change],
  );

  const commitName = useCallback(() => {
    const current = recordRef.current;
    if (!current) return;
    const name = draftName.trim() || "Untitled";
    setDraftName(name);
    const next = { ...current, name };
    replaceRecord(next);
    if (session) session.updateDraft((draft) => ({ ...draft, name }));
    else void saveRecordingName(current.id, name).catch(() => {});
  }, [draftName, replaceRecord, session]);

  const duplicate = useCallback(async () => {
    history.finish();
    await history.flush();
    const current = recordRef.current;
    if (!current) return;
    const copy = {
      ...current,
      ...(current.noteEdits ? { noteEdits: structuredClone(current.noteEdits) } : {}),
      id: uid(),
      name: `${current.name} (copy)`,
      createdAt: Date.now(),
    };
    delete copy.editHead;
    delete copy.editHistory;
    await putRecording(copy);
    if (mounted.current) navigate(recordingPath(copy.id));
  }, [navigate, history.finish, history.flush]);

  const remove = useCallback(async () => {
    const current = recordRef.current;
    if (tuneLocked || session) return;
    if (!current || !confirm(`Delete “${current.name}”?`)) return;
    history.cancel();
    await stopEditorSaves(current.id);
    await deleteRecording(current.id);
    if (mounted.current) navigate("/", { state: { deletedRecording: current.name } });
  }, [navigate, history.cancel]);

  const noteAt = useCallback(
    (event: MouseEvent<HTMLCanvasElement>) => {
      if (!record) return null;
      return noteAtPoint(items, rollView, rollPoint(event.currentTarget, event));
    },
    [items, rollView, record],
  );

  const muteNote = useCallback(
    (item: NoteItem) => {
      const current = recordRef.current;
      if (!current || auditionRef.current || saving.current) return;
      stopPlayback();
      history.change(item.muted ? "Unmute note" : "Mute note", (value) => ({
        ...value,
        muted: toggleMuted(value.muted ?? [], item),
      }));
    },
    [stopPlayback, history.change],
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
    (event: MouseEvent<HTMLCanvasElement>) => {
      const grabs = claimRef.current(event.nativeEvent as PointerEvent);
      setRollHover(grabs ? "drag" : noteAt(event) ? "note" : null);
    },
    [noteAt],
  );

  return {
    adHoc: !!session,
    tuneLocked,
    savingTune,
    saveTune,
    finishSession,
    sharing,
    copyTuneLink: () => sharing.copyLink(id),
    capabilities: record ? recordingCapabilities(record) : null,
    knobAvailability: (key: keyof Knobs) =>
      record ? knobAvailability(record, key) : { enabled: false },
    notice,
    dismissNotice,
    record,
    versions,
    analysis,
    analysisReady,
    loadError,
    retryAnalysis: () => setLoadAttempt((attempt) => attempt + 1),
    editingDisabled: !record || !analysisReady || versions.busy || savingTune,
    drafting: history.drafting,
    beginKnob: (key: keyof Knobs) => {
      if (!recordRef.current || !knobAvailability(recordRef.current, key).enabled) return;
      history.finish();
      knobBaseline.current = recordRef.current;
      history.begin(`Change ${KNOB_DEFS.find((def) => def.key === key)?.label ?? key}`);
    },
    draftKnob: (key: keyof Knobs, value: number) => {
      const current = knobBaseline.current;
      if (!current || !knobAvailability(current, key).enabled || !isKnobs({ [key]: value })) return;
      const melody = melodySettingFor(current);
      history.update(
        captureEditSnapshot(
          value === resolveKnobs(melody.preset, melody.overrides)[key]
            ? current
            : {
                ...current,
                melody: { ...melody, overrides: { ...melody.overrides, [key]: value } },
              },
        ),
      );
    },
    commitGesture: history.commit,
    cancelGesture: history.cancel,
    selectedPitchEdited: selectedItem?.editState.axes.includes("pitch") ?? false,
    canEditPitch: analysisReady && !showingPreview && !versions.busy && !savingTune,
    shiftSelectedPitch,
    resetSelectedPitch,
    resetAllNoteEdits,
    inactivePitchEditCount:
      processed?.editCoverage.filter((edit) => edit.status !== "active").length ?? 0,
    displayNotes,
    previewLabel,
    previewApplied,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    undoLabel: history.undoLabel,
    redoLabel: history.redoLabel,
    undo: history.undo,
    redo: history.redo,
    stopPlayback,
    viewport,
    draftName,
    setDraftName: (name: string) => {
      if (saving.current) return;
      setDraftName(name);
      session?.updateDraft((draft) => ({ ...draft, name }));
    },
    commitName,
    traceRef,
    rollRef,
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
      ? `${record.bpm} BPM · ${record.beatsPerBar}/4 · ${record.durationSec.toFixed(1)}s · ${record.noteSource ? "No original audio" : `${record.sampleRate} Hz${record.capture.dspOff ? "" : " · ⚠ DSP was on"}`}`
      : "",
    playing,
    playhead,
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
    canExport,
    importAnalysisMismatch,
  };
}
