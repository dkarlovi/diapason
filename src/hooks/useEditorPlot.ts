import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useEditorGestures } from "./useEditorGestures";
import type { Recording } from "../db";
import type { Frame, NoteEvent } from "../notes";
import { drawTrace, type TraceView } from "../trace";
import { fittedPitch, followPan, timeWindow, zoomedTime } from "../editor-viewport";

interface Options {
  record: Recording | null;
  frames: Frame[];
  notes: NoteEvent[];
  muted: NoteEvent[];
  edited?: NoteEvent[];
  grid: number;
  position: number | null;
  traceRef: RefObject<HTMLCanvasElement | null>;
  rollRef: RefObject<HTMLCanvasElement | null>;
}

function drawVisible(canvas: HTMLCanvasElement | null, frames: Frame[], view: TraceView) {
  if (canvas?.clientWidth) drawTrace(canvas, frames, view);
}

function usePlotRedraw(
  draw: () => void,
  traceRef: Options["traceRef"],
  rollRef: Options["rollRef"],
) {
  const redraw = useRef(draw);
  redraw.current = draw;
  useEffect(draw, [draw]);
  useEffect(() => {
    const update = () => redraw.current();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (traceRef.current) observer?.observe(traceRef.current);
    if (rollRef.current) observer?.observe(rollRef.current);
    const theme = window.matchMedia?.("(prefers-color-scheme: dark)");
    window.addEventListener("resize", update);
    theme?.addEventListener("change", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      theme?.removeEventListener("change", update);
    };
  }, [traceRef, rollRef]);
}

export function useEditorPlot({
  record,
  frames,
  notes,
  muted,
  edited,
  grid,
  position,
  traceRef,
  rollRef,
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
  useEffect(() => {
    if (position !== null)
      setPan((current) => followPan(duration, zoom, current, position, visible));
  }, [duration, zoom, position, visible]);
  const draw = useCallback(() => {
    if (!record) return;
    const beats = { bpm: record.bpm, beatsPerBar: record.beatsPerBar, subdivision: grid || 1 };
    const shared = { ...view, beats, ...(position === null ? {} : { playheadTime: position }) };
    drawVisible(traceRef.current, frames, {
      ...shared,
      pitchLabels: "none",
      showTimeLabels: false,
    });
    drawVisible(rollRef.current, traceOverlay ? frames : [], {
      ...shared,
      notes,
      muted,
      ...(edited ? { edited } : {}),
    });
  }, [record, view, grid, position, frames, notes, muted, edited, traceOverlay, traceRef, rollRef]);
  usePlotRedraw(draw, traceRef, rollRef);
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
  };
}
