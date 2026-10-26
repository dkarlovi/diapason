import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNoteDrag } from "./useNoteDrag";
import type { NoteItem } from "../recording";

afterEach(cleanup);
const note = { midi: 69, name: "A4", start: 0, duration: 1 };
const item: NoteItem = {
  id: 1,
  source: { start: 0, end: 1 },
  raw: note,
  automatic: note,
  note,
  muted: false,
  editState: { ids: [], axes: [], differingAxes: [] },
};
// 20 semitones over 500px: 25px per semitone, A4 centred at y = 275.
const view = { tMin: 0, tMax: 1, midiMin: 60, midiMax: 80, noteHeight: 1 };
function setup(enabled = true) {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "clientHeight", { value: 500 });
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500 }) as DOMRect;
  document.body.append(canvas);
  const preview = vi.fn();
  const commit = vi.fn();
  const hook = renderHook(() =>
    useNoteDrag({ rollRef: { current: canvas }, selected: item, view, enabled, preview, commit }),
  );
  const pointer = (type: string, y: number, props: Record<string, unknown> = {}) => {
    const event = new MouseEvent(type, {
      clientX: 500,
      clientY: y,
      cancelable: true,
      bubbles: true,
    });
    Object.defineProperties(event, {
      pointerId: { value: props.id ?? 1 },
      pointerType: { value: props.type ?? "mouse" },
      isPrimary: { value: props.primary ?? true },
    });
    act(() => canvas.dispatchEvent(event));
    return event;
  };
  return { canvas, preview, commit, pointer, claims: hook.result.current };
}

it("drags the selected note by whole semitones and saves once on release", () => {
  const { preview, commit, pointer, canvas } = setup();
  const clicked = vi.fn();
  canvas.addEventListener("click", clicked);
  expect(pointer("pointerdown", 275).defaultPrevented).toBe(true);
  pointer("pointermove", 262);
  pointer("pointermove", 250);
  pointer("pointermove", 226);
  pointer("pointermove", 224);
  expect(preview.mock.calls).toEqual([[70], [71]]);
  expect(commit).not.toHaveBeenCalled();
  pointer("pointerup", 224);
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(commit).toHaveBeenCalledExactlyOnceWith(71);
  act(() => canvas.click());
  expect(clicked).not.toHaveBeenCalled();
  act(() => canvas.click());
  expect(clicked).toHaveBeenCalledOnce();
});
it("treats tiny movement as a click and returning to the start as no edit", () => {
  const { preview, commit, pointer, canvas } = setup();
  const clicked = vi.fn();
  canvas.addEventListener("click", clicked);
  pointer("pointerdown", 275);
  pointer("pointermove", 272);
  pointer("pointerup", 272);
  act(() => canvas.click());
  expect(clicked).toHaveBeenCalledOnce();
  pointer("pointerdown", 275);
  pointer("pointermove", 250);
  pointer("pointermove", 276);
  pointer("pointerup", 276);
  expect(preview.mock.calls).toEqual([[70], [69], [null]]);
  expect(commit).not.toHaveBeenCalled();
});
it("ignores presses away from the selected note, other buttons, and disabled editing", () => {
  const { claims, pointer, preview } = setup();
  const press = (y: number, button = 0) => {
    const event = new MouseEvent("pointerdown", { clientX: 500, clientY: y, button });
    return claims(event as PointerEvent);
  };
  expect(press(275)).toBe(true);
  // The grab target is at least 24px tall even for a thin note.
  expect(press(286)).toBe(true);
  expect(press(300)).toBe(false);
  expect(press(275, 1)).toBe(false);
  pointer("pointerdown", 400);
  pointer("pointermove", 300);
  expect(preview).not.toHaveBeenCalled();
  cleanup();
  expect(setup(false).claims(new MouseEvent("pointerdown", { clientY: 275 }) as PointerEvent)).toBe(
    false,
  );
});
it("cancels on Escape without letting it dismiss the selection, and on a second finger", () => {
  const { preview, commit, pointer } = setup();
  const dismissed = vi.fn();
  document.addEventListener("keydown", dismissed);
  pointer("pointerdown", 275, { type: "touch" });
  pointer("pointermove", 225, { type: "touch" });
  act(() => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(dismissed).not.toHaveBeenCalled();
  pointer("pointerup", 225, { type: "touch" });
  expect(commit).not.toHaveBeenCalled();
  pointer("pointerdown", 275, { type: "touch" });
  pointer("pointermove", 225, { type: "touch" });
  pointer("pointerdown", 100, { type: "touch", id: 2, primary: false });
  pointer("pointerup", 225, { type: "touch" });
  expect(preview).toHaveBeenLastCalledWith(null);
  expect(commit).not.toHaveBeenCalled();
  document.removeEventListener("keydown", dismissed);
});
