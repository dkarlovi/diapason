import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useEditorPlot } from "./useEditorPlot";
import type { Recording } from "../../Recording/Recording.type";
import { createPlayheadStore } from "../../Playback/Playhead.store";
import type { TraceView } from "../../Audio/Trace";

const drawTrace = vi.hoisted(() => vi.fn());
vi.mock("../../Audio/Trace", async (original) => ({
  ...(await original<typeof import("../../Audio/Trace")>()),
  drawTrace,
}));
afterEach(() => {
  cleanup();
  drawTrace.mockClear();
});
function setup(onRender = () => {}, height = 500) {
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, {
    clientWidth: { value: 1000 },
    clientHeight: { value: height },
  });
  const rollRef = { current: canvas };
  const traceRef = { current: null };
  const playhead = createPlayheadStore();
  const result = renderHook(
    ({ id }) => {
      onRender();
      return useEditorPlot({
        record: { id, durationSec: 20 } as Recording,
        frames: [],
        notes: [],
        muted: [],
        grid: 0,
        playhead,
        rollRef,
        traceRef,
        claimsPointer: () => false,
      });
    },
    { initialProps: { id: "one" } },
  );
  return { canvas, playhead, ...result };
}
it("preserves the viewport for recording edits and resets both axes for another recording", () => {
  const { result, rerender } = setup();
  const fitted = result.current.view;
  act(() => {
    result.current.zoomTime(4);
    result.current.setPan(5);
    result.current.zoomPitch(2);
    result.current.revealPitch(100, 0);
  });
  const changed = result.current.view;
  expect(changed.tMin).toBeGreaterThan(fitted.tMin);
  expect(changed.midiMax - changed.midiMin).toBeLessThan(fitted.midiMax - fitted.midiMin);
  rerender({ id: "one" });
  expect(result.current.view).toEqual(changed);
  rerender({ id: "two" });
  expect(result.current.view).toEqual(fitted);
});
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
it("redraws the playhead and follows playback without re-rendering", () => {
  let renders = 0;
  const { playhead, result } = setup(() => renders++);
  act(() => result.current.zoomTime(4));
  const before = renders;
  drawTrace.mockClear();
  act(() => playhead.getState().set(1));
  act(() => playhead.getState().set(2));
  expect(renders).toBe(before);
  expect(drawTrace.mock.calls.map(([, , view]) => view.playheadTime)).toEqual([1, 2]);
  act(() => playhead.getState().set(15));
  expect(renders).toBe(before + 1);
  expect(result.current.view.tMin).toBeLessThanOrEqual(15);
  expect(result.current.view.tMax).toBeGreaterThan(15);
  act(() => playhead.getState().set(null));
  expect(drawTrace.mock.lastCall?.[2].playheadTime).toBeUndefined();
});

it("redraws saved charts after a seed change without re-rendering or stopping playback", () => {
  let renders = 0;
  const { playhead } = setup(() => renders++);
  act(() => playhead.getState().set(2));
  const before = renders;
  drawTrace.mockClear();
  act(() => window.dispatchEvent(new Event("studio-theme-change")));
  expect(drawTrace.mock.calls).toHaveLength(1);
  expect(drawTrace.mock.lastCall?.[2].playheadTime).toBe(2);
  expect(renders).toBe(before);
});

it("does not draw a track collapsed to zero height during panel transitions", () => {
  const { playhead } = setup(() => {}, 0);
  act(() => playhead.getState().set(1));
  act(() => window.dispatchEvent(new Event("studio-theme-change")));
  expect(drawTrace).not.toHaveBeenCalled();
});
function transposedSetup() {
  const canvas = (label: string) => {
    const element = document.createElement("canvas");
    element.dataset.label = label;
    Object.defineProperties(element, {
      clientWidth: { value: 1000 },
      clientHeight: { value: 500 },
    });
    return element;
  };
  const traceRef = { current: canvas("trace") };
  const rollRef = { current: canvas("roll") };
  const note = { midi: 84, name: "C6", start: 1, duration: 1 };
  const result = renderHook(
    ({ transpose }) =>
      useEditorPlot({
        record: { id: "one", durationSec: 20, bpm: 120, beatsPerBar: 4 } as Recording,
        frames: [],
        notes: [note],
        muted: [],
        grid: 0,
        transpose,
        playhead: createPlayheadStore(),
        rollRef,
        traceRef,
        claimsPointer: () => false,
      }),
    { initialProps: { transpose: 0 } },
  );
  const last = (label: string) =>
    drawTrace.mock.calls
      .filter(([target]) => (target as HTMLCanvasElement).dataset.label === label)
      .at(-1)?.[2] as TraceView | undefined;
  return { ...result, last };
}
it("scrolls the pitch axis past transposed notes", () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  try {
    const { result, rerender, last } = transposedSetup();
    const before = last("roll")!;
    const logical = result.current.view;
    rerender({ transpose: -12 });
    expect(result.current.view.midiMin).toBeCloseTo(logical.midiMin);
    act(() => vi.advanceTimersByTime(200));
    const moving = last("roll")!;
    const onScreen = (view: TraceView) => view.notes![0]!.midi - view.midiMin;
    expect(onScreen(moving)).toBeCloseTo(onScreen(before));
    expect(moving.midiMin).toBeLessThan(before.midiMin);
    expect(moving.midiMin).toBeGreaterThan(before.midiMin - 12);
    act(() => vi.advanceTimersByTime(400));
    const settled = last("roll")!;
    expect(settled.notes![0]).toMatchObject({ midi: 72, name: "C5" });
    expect(settled.midiMin).toBeCloseTo(before.midiMin - 12);
    expect(last("trace")!.midiMin).toBeCloseTo(logical.midiMin);
  } finally {
    vi.useRealTimers();
  }
});
it("jumps straight to the transposed pitch when motion is reduced", () => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion"),
    addEventListener() {},
    removeEventListener() {},
  }));
  try {
    const { rerender, last } = transposedSetup();
    rerender({ transpose: -12 });
    expect(last("roll")!.notes![0]).toMatchObject({ midi: 72, name: "C5" });
  } finally {
    vi.unstubAllGlobals();
  }
});
