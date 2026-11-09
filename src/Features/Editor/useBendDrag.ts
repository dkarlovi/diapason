import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { bendHandleAtPoint } from "../../Editing/Editor.model";
import { traceHorizontalPadding } from "../../Audio/Trace";
import type { TraceView } from "../../Audio/Trace.type";
import type { NoteItem } from "../../Recording/NoteItem.type";
import type { PitchPoint } from "../../Melody/PitchCurve.type";
import { rollPoint } from "./useNoteDrag";
import { listenForDrag } from "./PointerDrag";

interface Options {
  rollRef: RefObject<HTMLCanvasElement | null>;
  selected: NoteItem | undefined;
  points: PitchPoint[];
  view: TraceView;
  enabled: boolean;
  active: boolean;
  begin(index: number): void;
  update(index: number, position: number, offset: number): void;
  commit(): void;
  cancel(): void;
}
interface BendDragState {
  id: number;
  index: number;
  x: number;
  y: number;
  point: PitchPoint;
  min: number;
  max: number;
  midi: number;
  positionsPerPixel: number;
  semitonesPerPixel: number;
  position: number;
  offset: number;
}

function startBendDrag(
  canvas: HTMLCanvasElement,
  event: PointerEvent,
  options: Omit<Options, "rollRef">,
): BendDragState | null {
  const { selected, points, view } = options;
  if (!selected) return null;
  const at = rollPoint(canvas, event);
  const index = bendHandleAtPoint(selected, points, view, at);
  if (index === null) return null;
  const point = points[index]!;
  const padding = traceHorizontalPadding(at.width, view.inset);
  const previous = points[Math.max(0, index - 1)]!.position;
  const next = points[index + 1]!.position;
  return {
    id: event.pointerId,
    index,
    x: event.clientX,
    y: event.clientY,
    point,
    min: index ? previous + Math.min(0.02, (point.position - previous) / 2) : 0,
    max: index ? next - Math.min(0.02, (next - point.position) / 2) : 0,
    midi: selected.note.midi,
    positionsPerPixel:
      (view.tMax - view.tMin) / (at.width - padding.left - padding.right) / selected.note.duration,
    semitonesPerPixel: (view.midiMax - view.midiMin) / at.height,
    position: point.position,
    offset: point.offset,
  };
}

function moveBendDrag(drag: BendDragState, event: PointerEvent) {
  const dx = event.clientX - drag.x,
    dy = event.clientY - drag.y;
  drag.position = Math.max(
    drag.min,
    Math.min(drag.max, drag.point.position + dx * drag.positionsPerPixel),
  );
  const offset = Math.max(
    -48,
    -drag.midi,
    Math.min(48, 127 - drag.midi, drag.point.offset - dy * drag.semitonesPerPixel),
  );
  drag.offset = Math.round(offset * 100) / 100;
}

export function useBendDrag({ rollRef, ...options }: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const claims = useCallback(
    (event: PointerEvent) => {
      const { selected, points, view, enabled } = latest.current;
      const canvas = rollRef.current;
      if (
        !enabled ||
        !selected ||
        !canvas ||
        (!event.isPrimary && event.isPrimary !== undefined) ||
        event.button > 0
      )
        return false;
      return bendHandleAtPoint(selected, points, view, rollPoint(canvas, event)) !== null;
    },
    [rollRef],
  );
  const reset = useRef(() => {});
  const cancel = useRef(() => {});
  const selection = useRef(options.selected?.source);
  const source = options.selected?.source;
  useEffect(() => {
    const previous = selection.current;
    if (source?.start !== previous?.start || source?.end !== previous?.end) cancel.current();
    selection.current = source;
  }, [source]);
  useEffect(() => {
    if (!options.active) reset.current();
  }, [options.active]);
  useEffect(() => {
    if (!options.enabled) cancel.current();
  }, [options.enabled]);

  useEffect(() => {
    const canvas = rollRef.current;
    if (!canvas) return;
    let drag: BendDragState | null = null;
    let moved = false;
    const release = (id: number) => {
      if (canvas.hasPointerCapture?.(id)) canvas.releasePointerCapture(id);
    };
    reset.current = () => {
      const id = drag?.id;
      drag = null;
      if (id !== undefined) release(id);
    };
    const finish = (save: boolean) => {
      if (!drag) return;
      const changed = drag.position !== drag.point.position || drag.offset !== drag.point.offset;
      reset.current();
      if (save && moved && changed) latest.current.commit();
      else latest.current.cancel();
    };
    cancel.current = () => finish(false);
    const down = (event: PointerEvent) => {
      if (drag) return finish(false);
      moved = false;
      if (!claims(event)) return;
      drag = startBendDrag(canvas, event, latest.current);
      if (!drag) return;
      event.preventDefault();
      latest.current.begin(drag.index);
      canvas.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      event.preventDefault();
      if (!moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      moved = true;
      moveBendDrag(drag, event);
      latest.current.update(drag.index, drag.position, drag.offset);
    };
    const end = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) finish(event.type === "pointerup");
    };
    const controller = new AbortController();
    const { signal } = controller;
    const consumeClick = () => {
      if (!moved) return false;
      moved = false;
      return true;
    };
    listenForDrag(canvas, signal, { down, move, end }, consumeClick);
    canvas.addEventListener(
      "lostpointercapture",
      (event) => {
        if (drag?.id === event.pointerId) finish(false);
      },
      { signal },
    );
    window.addEventListener(
      "keydown",
      (event) => {
        if (!drag || event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      },
      { signal, capture: true },
    );
    return () => {
      controller.abort();
      finish(false);
    };
  }, [rollRef, claims]);
  return claims;
}
