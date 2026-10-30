import { useCallback, useEffect, useRef, type RefObject } from "react";
import { draggedPitch, hitsSelectedNote, type RollPoint } from "../editor-model";
import type { EditGesture } from "./useSliderCommit";
import { listenForDrag } from "./pointer-drag";
import type { TraceView } from "../trace";
import type { NoteItem } from "../Recording/NoteItem.type";

interface Options {
  rollRef: RefObject<HTMLCanvasElement | null>;
  selected: NoteItem | undefined;
  view: TraceView;
  enabled: boolean;
  gesture: EditGesture;
}

export function rollPoint(
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
): RollPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Vertical pitch drags of the already-selected note. Returns the test the canvas
 * gestures use to leave such a press alone instead of panning.
 */
export function useNoteDrag(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const claims = useCallback((event: PointerEvent) => {
    const { rollRef, selected, view, enabled } = latest.current;
    const canvas = rollRef.current;
    const primary = event.isPrimary !== false && (event.pointerType === "touch" || !event.button);
    return (
      enabled &&
      primary &&
      !!selected &&
      !!canvas &&
      hitsSelectedNote(selected, view, rollPoint(canvas, event))
    );
  }, []);
  const resetDrag = useRef<() => void>(() => {});
  useEffect(() => {
    if (!options.gesture.active) resetDrag.current();
  }, [options.gesture.active]);
  const { rollRef } = options;
  useEffect(() => {
    const canvas = rollRef.current;
    if (!canvas) return;
    let drag: { id: number; y: number; from: number; midi: number; semitone: number } | null = null;
    let moved = false;
    const finish = (save: boolean) => {
      if (!drag) return;
      const { from, midi } = drag;
      drag = null;
      if (save && moved && midi !== from) latest.current.gesture.commit();
      else latest.current.gesture.cancel();
    };
    resetDrag.current = () => {
      drag = null;
    };
    const down = (event: PointerEvent) => {
      // A second finger hands the gesture back to pinch and pan.
      if (drag) return finish(false);
      moved = false;
      if (!claims(event)) return;
      event.preventDefault();
      const { selected, view } = latest.current;
      drag = {
        id: event.pointerId,
        y: event.clientY,
        from: selected!.note.midi,
        midi: selected!.note.midi,
        semitone: canvas.clientHeight / (view.midiMax - view.midiMin || 1),
      };
      latest.current.gesture.begin();
      canvas.setPointerCapture?.(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      event.preventDefault();
      const dy = event.clientY - drag.y;
      if (!moved && Math.abs(dy) < 4) return;
      moved = true;
      const midi = draggedPitch(drag.from, dy, drag.semitone);
      if (midi === drag.midi) return;
      drag.midi = midi;
      latest.current.gesture.update(midi);
    };
    const up = (event: PointerEvent) => {
      if (drag?.id !== event.pointerId) return;
      finish(event.type === "pointerup");
      if (canvas.hasPointerCapture?.(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
    };
    const key = (event: KeyboardEvent) => {
      if (!drag || event.key !== "Escape") return;
      // Escape only cancels the drag; it must not also dismiss the selection.
      event.stopPropagation();
      finish(false);
    };
    const controller = new AbortController();
    const { signal } = controller;
    listenForDrag(canvas, signal, { down, move, end: up }, () => {
      // The click that ends a drag must not reselect or replay the note.
      const ended = moved;
      moved = false;
      return ended;
    });
    canvas.addEventListener("lostpointercapture", () => finish(false), { signal });
    window.addEventListener("keydown", key, { signal, capture: true });
    return () => controller.abort();
  }, [rollRef, claims]);
  return claims;
}
