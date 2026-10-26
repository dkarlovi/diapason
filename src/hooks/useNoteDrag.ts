import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { draggedPitch, hitsSelectedNote, withDraftPitch, type RollPoint } from "../editor-model";
import { midiToName, type NoteEvent } from "../notes";
import { listenForDrag } from "./pointer-drag";
import type { NoteItem } from "../recording";
import type { TraceView } from "../trace";

interface Options {
  rollRef: RefObject<HTMLCanvasElement | null>;
  selected: NoteItem | undefined;
  view: TraceView;
  enabled: boolean;
  /** The pitch being dragged to, or null when the drag ends or is cancelled. */
  preview(midi: number | null): void;
  commit(midi: number): void;
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
      if (moved) latest.current.preview(null);
      if (save && moved && midi !== from) latest.current.commit(midi);
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
      latest.current.preview(midi);
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
    window.addEventListener("keydown", key, { signal, capture: true });
    return () => controller.abort();
  }, [rollRef, claims]);
  return claims;
}

/**
 * The roll's items with the selected note shown at a dragged pitch, which is only
 * auditioned until the drag is released.
 */
export function useDraftPitch(
  items: NoteItem[],
  selected: NoteItem | undefined,
  previewNote: (note: NoteEvent) => void,
) {
  const [pitch, setPitch] = useState<number | null>(null);
  const shown = useMemo(() => withDraftPitch(items, selected, pitch), [items, selected, pitch]);
  const notes = useMemo(
    () => shown.filter((item) => !item.muted).map((item) => item.note),
    [shown],
  );
  return {
    items: shown,
    notes,
    selected: selected && shown[items.indexOf(selected)],
    preview: (midi: number | null) => {
      setPitch(midi);
      if (midi !== null && selected)
        previewNote({ ...selected.note, midi, name: midiToName(midi) });
    },
  };
}
