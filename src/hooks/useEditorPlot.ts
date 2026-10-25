import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Recording } from "../db";
import type { Frame, NoteEvent } from "../notes";
import { drawTrace, type TraceView } from "../trace";
import { fittedPitch, followPan, timeWindow } from "../editor-viewport";

interface Options {
  record: Recording | null;
  frames: Frame[];
  notes: NoteEvent[];
  muted: NoteEvent[];
  grid: number;
  position: number | null;
  traceRef: RefObject<HTMLCanvasElement | null>;
  rollRef: RefObject<HTMLCanvasElement | null>;
}
export function useEditorPlot({
  record,
  frames,
  notes,
  muted,
  grid,
  position,
  traceRef,
  rollRef,
}: Options) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState(0);
  const [pitchZoom, setPitchZoom] = useState(1),
    [visible, setVisible] = useState(1);
  const [traceOverlay, setTraceOverlay] = useState(false);
  const duration = record?.durationSec ?? 1;
  const range = useMemo(() => fittedPitch([...notes, ...muted]), [notes, muted]);
  const view: TraceView = useMemo(() => {
    const center = (range.midiMin + range.midiMax) / 2;
    const span = Math.max(4, (range.midiMax - range.midiMin) / pitchZoom);
    return {
      inset: true,
      pitchLabels: "all",
      timeLabelY: 82,
      noteHeight: 0.68,
      ...timeWindow(duration, zoom, pan, visible),
      midiMin: center - span / 2,
      midiMax: center + span / 2,
    };
  }, [duration, zoom, pan, visible, range, pitchZoom]);
  useEffect(() => {
    setZoom(1);
    setPan(0);
    setPitchZoom(1);
  }, [record?.id]);
  useEffect(() => {
    if (position !== null)
      setPan((current) => followPan(duration, zoom, current, position, visible));
  }, [duration, zoom, position, visible]);
  const draw = useCallback(() => {
    if (!record) return;
    const beats = { bpm: record.bpm, beatsPerBar: record.beatsPerBar, subdivision: grid || 1 };
    const shared = { ...view, beats, ...(position === null ? {} : { playheadTime: position }) };
    if (traceRef.current?.clientWidth)
      drawTrace(traceRef.current, frames, {
        ...shared,
        pitchLabels: "none",
        showTimeLabels: false,
      });
    if (rollRef.current?.clientWidth)
      drawTrace(rollRef.current, traceOverlay ? frames : [], { ...shared, notes, muted });
  }, [record, view, grid, position, frames, notes, muted, traceOverlay, traceRef, rollRef]);
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
  }, [record?.id, traceRef, rollRef]);
  return {
    view,
    canPan: zoom > 1 || visible < 1,
    zoom,
    pan,
    setPan,
    setVisible,
    traceOverlay,
    setTraceOverlay,
    zoomTime: (factor: number) => setZoom((current) => Math.min(32, Math.max(1, current * factor))),
    fitTime: () => {
      setZoom(1);
      setPan(0);
    },
    zoomPitch: (factor: number) =>
      setPitchZoom((current) => Math.min(8, Math.max(0.25, current * factor))),
    fitPitch: () => setPitchZoom(1),
  };
}
