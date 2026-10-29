import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useEditorGestures } from "./useEditorGestures";
import type { Recording } from "../db";
import type { Frame, NoteEvent } from "../notes";
import { drawTrace, type NoteOrigin, type TraceLayer, type TraceView } from "../trace";
import {
  fittedPitch,
  followPan,
  revealPitchShift,
  timeWindow,
  zoomedTime,
} from "../editor-viewport";
import type { PlayheadStore } from "../playhead-store";

interface Options {
  record: Recording | null;
  frames: Frame[];
  notes: NoteEvent[];
  muted: NoteEvent[];
  edited?: NoteEvent[];
  origins?: NoteOrigin[];
  grid: number;
  playhead: PlayheadStore;
  traceRef: RefObject<HTMLCanvasElement | null>;
  rollRef: RefObject<HTMLCanvasElement | null>;
  claimsPointer(event: PointerEvent): boolean;
}

const NO_FRAMES: Frame[] = [];

function drawVisible(
  canvas: HTMLCanvasElement | null,
  frames: Frame[],
  view: TraceView,
  layer: TraceLayer,
) {
  if (canvas?.clientWidth) drawTrace(canvas, frames, view, layer);
}

function usePlotRedraw(
  draw: (tick?: boolean) => void,
  follow: (position: number) => void,
  { playhead, traceRef, rollRef }: Pick<Options, "playhead" | "traceRef" | "rollRef">,
) {
  const redraw = useRef(draw);
  redraw.current = draw;
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
    [playhead],
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
  }, [traceRef, rollRef]);
}

export function useEditorPlot({
  record,
  frames,
  notes,
  muted,
  edited,
  origins,
  grid,
  playhead,
  traceRef,
  rollRef,
  claimsPointer,
}: Options) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState(0);
  const [pitchZoom, setPitchZoom] = useState(1),
    [visible, setVisible] = useState(1);
  const [pitchPan, setPitchPan] = useState(0);
  const [traceOverlay, setTraceOverlay] = useState(false);
  const duration = record?.durationSec ?? 1;
  const range = useMemo(() => fittedPitch([...notes, ...muted]), [notes, muted]);
  const view: TraceView = useMemo(() => {
    const span = Math.min(127, Math.max(4, (range.midiMax - range.midiMin) / pitchZoom));
    const center = Math.max(
      span / 2,
      Math.min(127 - span / 2, (range.midiMin + range.midiMax) / 2 + pitchPan),
    );
    return {
      inset: true,
      pitchLabels: "all",
      timeLabelY: 82,
      noteHeight: 0.68,
      ...timeWindow(duration, zoom, pan, visible),
      midiMin: center - span / 2,
      midiMax: center + span / 2,
    };
  }, [duration, zoom, pan, visible, range, pitchZoom, pitchPan]);
  useEffect(() => {
    setZoom(1);
    setPan(0);
    setPitchZoom(1);
    setPitchPan(0);
  }, [record?.id]);
  const follow = (position: number) => {
    const next = followPan(duration, zoom, pan, position, visible);
    if (next !== pan) setPan(next);
  };
  const layers = useRef({ trace: {} as TraceLayer, roll: {} as TraceLayer });
  /** Ticks reuse the resolved palette; any other redraw (theme, resize, edits) re-reads it. */
  const draw = useCallback(
    (tick = false) => {
      if (!record) return;
      const { trace, roll } = layers.current;
      if (!tick) trace.colors = roll.colors = undefined;
      const { position } = playhead.getState();
      const beats = { bpm: record.bpm, beatsPerBar: record.beatsPerBar, subdivision: grid || 1 };
      const shared = { ...view, beats, ...(position === null ? {} : { playheadTime: position }) };
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
        traceOverlay ? frames : NO_FRAMES,
        {
          ...shared,
          notes,
          muted,
          ...(edited ? { edited } : {}),
          ...(origins ? { origins } : {}),
        },
        roll,
      );
    },
    [
      record,
      view,
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
    ],
  );
  usePlotRedraw(draw, follow, { playhead, traceRef, rollRef });
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
