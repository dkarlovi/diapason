import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEditorPlot } from "./useEditorPlot";
import type { Recording } from "../db";

vi.mock("../trace", async (original) => ({
  ...(await original<typeof import("../trace")>()),
  drawTrace: () => undefined,
}));
afterEach(cleanup);
function setup() {
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { clientWidth: { value: 1000 }, clientHeight: { value: 500 } });
  const rollRef = { current: canvas };
  const traceRef = { current: null };
  const result = renderHook(() =>
    useEditorPlot({
      record: { id: "one", durationSec: 20 } as Recording,
      frames: [],
      notes: [],
      muted: [],
      grid: 0,
      position: null,
      rollRef,
      traceRef,
      claimsPointer: () => false,
    }),
  );
  return { canvas, ...result };
}
it("zooms each canvas axis with its wheel modifier and prevents browser zoom", () => {
  const { canvas, result } = setup();
  const wheel = new WheelEvent("wheel", { ctrlKey: true, deltaY: -100, cancelable: true });
  act(() => canvas.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  expect(result.current.zoom).toBeGreaterThan(1);
  const before = result.current.view.midiMax - result.current.view.midiMin;
  act(() =>
    canvas.dispatchEvent(
      new WheelEvent("wheel", { shiftKey: true, deltaY: -100, cancelable: true }),
    ),
  );
  expect(result.current.view.midiMax - result.current.view.midiMin).toBeLessThan(before);
  const plain = new WheelEvent("wheel", { deltaY: 100, cancelable: true });
  act(() => canvas.dispatchEvent(plain));
  expect(plain.defaultPrevented).toBe(false);
});
it("pans time and pitch with a middle-button drag, then releases the drag", () => {
  const { canvas, result } = setup();
  act(() => result.current.zoomTime(4));
  const start = result.current.view;
  const pointer = (type: string, props: object) => {
    const event = new MouseEvent(type, { cancelable: true, ...props });
    Object.defineProperty(event, "pointerId", { value: 1 });
    act(() => canvas.dispatchEvent(event));
  };
  pointer("pointerdown", { button: 1, clientX: 500, clientY: 200 });
  pointer("pointermove", { buttons: 4, clientX: 250, clientY: 250 });
  expect(result.current.view.tMin).toBeGreaterThan(start.tMin);
  expect(result.current.view.midiMax).toBeGreaterThan(start.midiMax);
  pointer("pointerup", { button: 1 });
  const end = result.current.view;
  pointer("pointermove", { clientX: 0, clientY: 0 });
  expect(result.current.view).toEqual(end);
  act(() => result.current.fitPitch());
  expect(result.current.view.midiMax).toBe(start.midiMax);
});

function touch(canvas: HTMLCanvasElement, type: string, id: number, x: number, y: number) {
  const event = new MouseEvent(type, { clientX: x, clientY: y, cancelable: true, bubbles: true });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: "touch" } });
  act(() => canvas.dispatchEvent(event));
}
it("pans by touch without selecting a note after dragging", () => {
  const { canvas, result } = setup();
  act(() => result.current.zoomTime(4));
  const start = result.current.view;
  touch(canvas, "pointerdown", 1, 500, 200);
  touch(canvas, "pointermove", 1, 250, 250);
  expect(result.current.view.tMin).toBeGreaterThan(start.tMin);
  expect(result.current.view.midiMax).toBeGreaterThan(start.midiMax);
  touch(canvas, "pointerup", 1, 250, 250);
  const click = new MouseEvent("click", { cancelable: true });
  canvas.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
});
it("pinches time and pitch independently, then resumes one-finger panning", () => {
  const { canvas, result } = setup();
  touch(canvas, "pointerdown", 1, 200, 200);
  touch(canvas, "pointerdown", 2, 400, 300);
  const pitch = result.current.view.midiMax - result.current.view.midiMin;
  touch(canvas, "pointermove", 2, 600, 300);
  expect(result.current.zoom).toBeCloseTo(2);
  expect(result.current.view.midiMax - result.current.view.midiMin).toBeCloseTo(pitch);
  touch(canvas, "pointermove", 2, 600, 400);
  expect(result.current.zoom).toBeCloseTo(2);
  expect(result.current.view.midiMax - result.current.view.midiMin).toBeCloseTo(pitch / 2);
  touch(canvas, "pointerup", 2, 600, 400);
  const before = result.current.view.tMin;
  touch(canvas, "pointermove", 1, 100, 200);
  expect(result.current.view.tMin).toBeGreaterThan(before);
});
it("keeps a stationary touch available as a note tap", () => {
  const { canvas } = setup();
  touch(canvas, "pointerdown", 1, 200, 200);
  touch(canvas, "pointerup", 1, 200, 200);
  const click = new MouseEvent("click", { cancelable: true });
  canvas.dispatchEvent(click);
  expect(click.defaultPrevented).toBe(false);
});
