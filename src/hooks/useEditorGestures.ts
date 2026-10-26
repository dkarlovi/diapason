import { useEffect, useRef, type RefObject } from "react";
import type { TraceView } from "../trace";
import { traceHorizontalPadding } from "../trace";

interface Options {
  canvases: RefObject<HTMLCanvasElement | null>[];
  view: TraceView;
  duration: number;
  visible: number;
  pitchPan: number;
  setPan(value: number): void;
  setPitchPan(value: number): void;
  zoomTime(factor: number, anchor?: number): void;
  zoomPitch(factor: number): void;
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
type Point = { x: number; y: number };
function touchGestures(
  canvas: HTMLCanvasElement,
  latest: { current: Options },
  signal: AbortSignal,
) {
  const pointers = new Map<number, Point>();
  let moved = false;
  let origin: Point | null = null;
  const point = (event: PointerEvent) => ({ x: event.clientX, y: event.clientY });
  const down = (event: PointerEvent) => {
    if (event.pointerType !== "touch") return;
    if (!pointers.size) {
      moved = false;
      origin = point(event);
    }
    pointers.set(event.pointerId, point(event));
    if (pointers.size > 1) moved = true;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    event.preventDefault();
    const next = point(event);
    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const padding = traceHorizontalPadding(canvas.clientWidth, true);
      const anchor = clamp(
        ((previous.x + other.x) / 2 - canvas.getBoundingClientRect().left - padding.left) /
          Math.max(1, canvas.clientWidth - padding.left - padding.right),
      );
      latest.current.zoomTime(axisScale(previous.x - other.x, next.x - other.x), anchor);
      latest.current.zoomPitch(axisScale(previous.y - other.y, next.y - other.y));
    } else {
      if (!moved && origin && Math.hypot(next.x - origin.x, next.y - origin.y) < 4) return;
      panCanvas(canvas, latest.current, next.x - previous.x, next.y - previous.y);
    }
    moved = true;
    pointers.set(event.pointerId, next);
  };
  const end = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerdown", down, { signal });
  canvas.addEventListener("pointermove", move, { signal, passive: false });
  canvas.addEventListener("pointerup", end, { signal });
  canvas.addEventListener("pointercancel", end, { signal });
  canvas.addEventListener("lostpointercapture", end, { signal });
  canvas.addEventListener(
    "click",
    (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    },
    { signal, capture: true },
  );
}
function axisScale(before: number, after: number) {
  // Ignore tiny separations so a nearly horizontal pinch does not wildly zoom pitch.
  return Math.max(24, Math.abs(after)) / Math.max(24, Math.abs(before));
}
function panCanvas(canvas: HTMLCanvasElement, current: Options, dx: number, dy: number) {
  const padding = traceHorizontalPadding(canvas.clientWidth, true);
  const timeSpan = current.view.tMax - current.view.tMin;
  const maxStart = Math.max(current.duration, 1) - timeSpan * current.visible;
  const tMin =
    current.view.tMin -
    (dx / Math.max(1, canvas.clientWidth - padding.left - padding.right)) * timeSpan;
  current.setPan(maxStart > 0 ? clamp(tMin / maxStart) : 0);
  current.setPitchPan(
    current.pitchPan +
      (dy / Math.max(1, canvas.clientHeight)) * (current.view.midiMax - current.view.midiMin),
  );
}
export function useEditorGestures(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const traceRef = options.canvases[0]!;
  const rollRef = options.canvases[1]!;
  useEffect(() => {
    const canvases = [traceRef.current, rollRef.current].filter((canvas) => canvas !== null);
    const cleanups = canvases.map((canvas) => {
      let drag: {
        id: number;
        x: number;
        y: number;
        tMin: number;
        timeSpan: number;
        pitchSpan: number;
        pitchPan: number;
      } | null = null;
      const plotWidth = () => {
        const padding = traceHorizontalPadding(canvas.clientWidth, true);
        return Math.max(1, canvas.clientWidth - padding.left - padding.right);
      };
      const down = (event: PointerEvent) => {
        if (event.button !== 1) return;
        event.preventDefault();
        const { view, pitchPan } = latest.current;
        drag = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          tMin: view.tMin,
          timeSpan: view.tMax - view.tMin,
          pitchSpan: view.midiMax - view.midiMin,
          pitchPan,
        };
        canvas.setPointerCapture?.(event.pointerId);
        canvas.style.cursor = "grabbing";
      };
      const move = (event: PointerEvent) => {
        if (!drag || drag.id !== event.pointerId) return;
        const current = latest.current;
        const maxStart = Math.max(current.duration, 1) - drag.timeSpan * current.visible;
        const tMin = drag.tMin - ((event.clientX - drag.x) / plotWidth()) * drag.timeSpan;
        current.setPan(maxStart > 0 ? clamp(tMin / maxStart) : 0);
        current.setPitchPan(
          drag.pitchPan +
            ((event.clientY - drag.y) / Math.max(1, canvas.clientHeight)) * drag.pitchSpan,
        );
      };
      const up = (event: PointerEvent) => {
        if (drag?.id !== event.pointerId) return;
        drag = null;
        if (canvas.hasPointerCapture?.(event.pointerId))
          canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = "";
      };
      const wheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.shiftKey) return;
        event.preventDefault();
        const pixels =
          event.deltaY *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
        const factor = Math.exp(-Math.max(-400, Math.min(400, pixels)) * 0.002);
        if (event.ctrlKey) {
          const padding = traceHorizontalPadding(canvas.clientWidth, true);
          latest.current.zoomTime(
            factor,
            clamp(
              (event.clientX - canvas.getBoundingClientRect().left - padding.left) / plotWidth(),
            ),
          );
        } else latest.current.zoomPitch(factor);
      };
      const auxiliary = (event: MouseEvent) => {
        if (event.button === 1) event.preventDefault();
      };
      const controller = new AbortController();
      const options = { signal: controller.signal };
      touchGestures(canvas, latest, controller.signal);
      canvas.addEventListener("pointerdown", down, options);
      canvas.addEventListener("pointermove", move, options);
      canvas.addEventListener("pointerup", up, options);
      canvas.addEventListener("pointercancel", up, options);
      canvas.addEventListener("lostpointercapture", up, options);
      canvas.addEventListener("wheel", wheel, { ...options, passive: false });
      canvas.addEventListener("auxclick", auxiliary, options);
      return () => {
        controller.abort();
        canvas.style.cursor = "";
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [traceRef, rollRef]);
}
