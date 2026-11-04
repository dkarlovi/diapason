import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useEditorGestures } from "./useEditorGestures";
import type { Recording } from "../../Recording/Recording.type";
import { midiToName, type Frame, type NoteEvent } from "../../Melody/Notes";
import { drawTrace } from "../../Audio/Trace";
import type { NoteOrigin, TraceLayer, TraceView } from "../../Audio/Trace.type";
import { scalePitchClasses, type Key } from "../../Melody/Key";
import {
  fittedPitch,
  followPan,
  revealPitchShift,
  timeWindow,
  transposeFrame,
  zoomedTime,
} from "./EditorViewport";
import type { PlayheadStore } from "../../Playback/Playhead.store";

interface Options {
  record: Recording | null;
  frames: Frame[];
  notes: NoteEvent[];
  muted: NoteEvent[];
  edited?: NoteEvent[];
  origins?: NoteOrigin[];
  grid: number;
  key?: Key | null;
  /** Semitones between the logical notes and the pitch they sound at, drawn on the roll. */
  transpose?: number;
  playhead: PlayheadStore;
  traceRef: RefObject<HTMLCanvasElement | null>;
  rollRef: RefObject<HTMLCanvasElement | null>;
  claimsPointer(event: PointerEvent): boolean;
}

const NO_FRAMES: Frame[] = [];

function shiftView(view: TraceView, semitones: number): TraceView {
  return { ...view, midiMin: view.midiMin + semitones, midiMax: view.midiMax + semitones };
}

function transposedLayer(
  layer: Required<Pick<Options, "notes" | "muted" | "edited" | "origins">>,
  semitones: number,
) {
  if (!semitones) return layer;
  // Trace matches edited notes by identity, so each note maps to exactly one shifted copy.
  const shifted = new Map<NoteEvent, NoteEvent>();
  const at = (note: NoteEvent) => {
    let copy = shifted.get(note);
    if (!copy) {
      const midi = note.midi + semitones;
      copy = { ...note, midi, name: midiToName(midi) };
      shifted.set(note, copy);
    }
    return copy;
  };
  return {
    notes: layer.notes.map(at),
    muted: layer.muted.map(at),
    edited: layer.edited.map(at),
    origins: layer.origins.map((origin) => ({
      ...origin,
      from: at(origin.from),
      to: at(origin.to),
    })),
  };
}

function transposedFrames(frames: Frame[], semitones: number) {
  if (!semitones) return frames;
  const ratio = 2 ** (semitones / 12);
  return frames.map((frame) =>
    frame.freq === null ? frame : { ...frame, freq: frame.freq * ratio },
  );
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Animates the roll from the previously drawn transposition to the current one. */
function useTransposeMotion(redraw: RefObject<(tick?: boolean) => void>) {
  const motion = useRef({ key: "", from: 0, to: 0, start: 0, frame: 0 });
  useEffect(() => () => cancelAnimationFrame(motion.current.frame), []);
  return useCallback(
    /** A new `key` (another recording) jumps straight to `target`. */
    (target: number, key: string, lead: number) => {
      const state = motion.current;
      const now = performance.now();
      if (key !== state.key) Object.assign(state, { key, from: target, to: target, start: 0 });
      if (target !== state.to) {
        const current = transposeFrame(state.from, state.to, now - state.start);
        cancelAnimationFrame(state.frame);
        Object.assign(state, {
          from: prefersReducedMotion() ? target : current.shift,
          to: target,
          start: now,
        });
        const step = () => {
          redraw.current(true);
          if (!transposeFrame(state.from, state.to, performance.now() - state.start).done)
            state.frame = requestAnimationFrame(step);
        };
        state.frame = requestAnimationFrame(step);
      }
      return transposeFrame(state.from, state.to, now - state.start, lead);
    },
    [redraw],
  );
}

function drawVisible(
  canvas: HTMLCanvasElement | null,
  frames: Frame[],
  view: TraceView,
  layer: TraceLayer,
) {
  if (canvas?.clientWidth && canvas.clientHeight) drawTrace(canvas, frames, view, layer);
}

function usePlotRedraw(
  draw: (tick?: boolean) => void,
  redraw: RefObject<(tick?: boolean) => void>,
  follow: (position: number) => void,
  { playhead, traceRef, rollRef }: Pick<Options, "playhead" | "traceRef" | "rollRef">,
) {
  const follower = useRef(follow);
  follower.current = follow;
  useEffect(() => draw(), [draw]);
  // Playback ticks bypass React: they turn the page when needed and redraw the canvases directly.
  useEffect(
    () =>
      playhead.subscribe(({ position }, previous) => {
        if (position === previous.position) return;
        if (position !== null) follower.current(position);
        redraw.current(true);
      }),
    [playhead, redraw],
  );
  useEffect(() => {
    const update = () => redraw.current();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (traceRef.current) observer?.observe(traceRef.current);
    if (rollRef.current) observer?.observe(rollRef.current);
    const theme = window.matchMedia?.("(prefers-color-scheme: dark)");
    const forced = window.matchMedia?.("(forced-colors: active)");
    forced?.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("studio-theme-change", update);
    theme?.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("studio-theme-change", update);
      theme?.removeEventListener("change", update);
      forced?.removeEventListener("change", update);
    };
  }, [traceRef, rollRef, redraw]);
}

function useViewportAxes(currentRecordingId: string | undefined) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState(0);
  const [pitchZoom, setPitchZoom] = useState(1);
  const [pitchPan, setPitchPan] = useState(0);
  const [recordingId, setRecordingId] = useState(currentRecordingId);
  if (recordingId !== currentRecordingId) {
    setRecordingId(currentRecordingId);
    setZoom(1);
    setPan(0);
    setPitchZoom(1);
    setPitchPan(0);
  }
  return { zoom, setZoom, pan, setPan, pitchZoom, setPitchZoom, pitchPan, setPitchPan };
}

export function useEditorPlot({
  record,
  frames,
  notes,
  muted,
  edited,
  origins,
  grid,
  key,
  transpose = 0,
  playhead,
  traceRef,
  rollRef,
  claimsPointer,
}: Options) {
  const { zoom, setZoom, pan, setPan, pitchZoom, setPitchZoom, pitchPan, setPitchPan } =
    useViewportAxes(record?.id);
  const [visible, setVisible] = useState(1);
  const [traceOverlay, setTraceOverlay] = useState(false);
  const duration = record?.durationSec ?? 1;
  const scale = useMemo(() => (key ? scalePitchClasses(key) : undefined), [key]);
  const range = useMemo(() => fittedPitch([...notes, ...muted]), [notes, muted]);
  const view: TraceView = useMemo(() => {
    const span = Math.min(127, Math.max(4, (range.midiMax - range.midiMin) / pitchZoom));
    // The roll is framed at sounding pitch, so the MIDI range limits apply after transposing.
    const sounding = Math.max(
      span / 2,
      Math.min(127 - span / 2, (range.midiMin + range.midiMax) / 2 + transpose + pitchPan),
    );
    const center = sounding - transpose;
    return {
      inset: true,
      pitchLabels: "all",
      timeLabelY: 82,
      noteHeight: 0.68,
      ...timeWindow(duration, zoom, pan, visible),
      midiMin: center - span / 2,
      midiMax: center + span / 2,
    };
  }, [duration, zoom, pan, visible, range, pitchZoom, pitchPan, transpose]);
  const follow = (position: number) => {
    const next = followPan(duration, zoom, pan, position, visible);
    if (next !== pan) setPan(next);
  };
  const layers = useRef({ trace: {} as TraceLayer, roll: {} as TraceLayer });
  const redraw = useRef<(tick?: boolean) => void>(() => {});
  const transposition = useTransposeMotion(redraw);
  /** Ticks reuse the resolved palette; any other redraw (theme, resize, edits) re-reads it. */
  const draw = useCallback(
    (tick = false) => {
      if (!record) return;
      const { trace, roll } = layers.current;
      if (!tick) trace.colors = roll.colors = undefined;
      const { position } = playhead.getState();
      const beats = { bpm: record.bpm, beatsPerBar: record.beatsPerBar, subdivision: grid || 1 };
      const shared = { ...view, beats, ...(position === null ? {} : { playheadTime: position }) };
      // Half a note bar ahead of the scrolling axis while the notes travel.
      const shift = transposition(transpose, record.id, (view.noteHeight ?? 1) / 2);
      drawVisible(
        traceRef.current,
        frames,
        {
          ...shared,
          pitchLabels: "none",
          showTimeLabels: false,
        },
        trace,
      );
      drawVisible(
        rollRef.current,
        traceOverlay ? transposedFrames(frames, shift.shift) : NO_FRAMES,
        {
          ...shiftView(shared, shift.shift),
          ...(scale ? { scale } : {}),
          notePitchOffset: shift.shift + shift.lead,
          animateKeyWarnings: !prefersReducedMotion(),
          ...transposedLayer(
            { notes, muted, edited: edited ?? [], origins: origins ?? [] },
            shift.shift + shift.lead,
          ),
        },
        roll,
      );
    },
    [
      record,
      view,
      scale,
      grid,
      playhead,
      frames,
      notes,
      muted,
      edited,
      origins,
      traceOverlay,
      traceRef,
      rollRef,
      transpose,
      transposition,
    ],
  );
  useLayoutEffect(() => {
    redraw.current = draw;
  }, [draw]);
  usePlotRedraw(draw, redraw, follow, { playhead, traceRef, rollRef });
  const zoomTime = (factor: number, anchor = 0) => {
    const next = zoomedTime({ duration, zoom, pan, visible }, factor, anchor);
    setZoom(next.zoom);
    setPan(next.pan);
  };
  const zoomPitch = (factor: number) =>
    setPitchZoom((current) => Math.min(8, Math.max(0.25, current * factor)));
  useEditorGestures({
    canvases: [traceRef, rollRef],
    view,
    duration,
    visible,
    pitchPan,
    setPan,
    setPitchPan,
    zoomTime,
    zoomPitch,
    claimsPointer,
  });
  return {
    view,
    canPan: zoom > 1 || visible < 1,
    zoom,
    pan,
    setPan,
    setVisible,
    traceOverlay,
    setTraceOverlay,
    zoomTime,
    fitTime: () => {
      setZoom(1);
      setPan(0);
    },
    zoomPitch,
    fitPitch: () => {
      setPitchZoom(1);
      setPitchPan(0);
    },
    revealPitch: (midi: number, covered: number) => {
      const shift = revealPitchShift(view, midi, covered);
      if (shift) setPitchPan((current) => current + shift);
    },
  };
}
