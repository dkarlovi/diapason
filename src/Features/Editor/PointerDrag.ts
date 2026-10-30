interface DragHandlers {
  down(event: PointerEvent): void;
  move(event: PointerEvent): void;
  end(event: PointerEvent): void;
}

/**
 * Pointer listeners for a drag on the canvas. `endedDrag` reports, and clears,
 * whether the press moved, so the click that ends a drag is swallowed.
 */
export function listenForDrag(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  { down, move, end }: DragHandlers,
  endedDrag: () => boolean,
) {
  canvas.addEventListener("pointerdown", down, { signal });
  canvas.addEventListener("pointermove", move, { signal, passive: false });
  canvas.addEventListener("pointerup", end, { signal });
  canvas.addEventListener("pointercancel", end, { signal });
  canvas.addEventListener(
    "click",
    (event) => {
      if (!endedDrag()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { signal, capture: true },
  );
}
