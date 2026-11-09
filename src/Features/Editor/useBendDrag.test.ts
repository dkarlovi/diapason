import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useBendDrag } from "./useBendDrag";
import type { NoteItem } from "../../Recording/NoteItem.type";
afterEach(cleanup);
it("claims an editable handle, clamps motion between neighbours and commits once", async () => {
  const note = { midi: 69, name: "A4", start: 0, duration: 1 };
  const item: NoteItem = {
    id: 1,
    source: { start: 0, end: 1 },
    note,
    raw: note,
    automatic: note,
    muted: false,
    editState: { ids: [], axes: [], differingAxes: [] },
  };
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
  document.body.append(canvas);
  const points = [
    { position: 0, offset: -3 },
    { position: 0.5, offset: -1 },
    { position: 1, offset: 0 },
  ];
  const begin = vi.fn(),
    update = vi.fn(),
    commit = vi.fn(),
    cancel = vi.fn();
  const hook = renderHook(() =>
    useBendDrag({
      rollRef: { current: canvas },
      selected: item,
      points,
      view: { tMin: 0, tMax: 1, midiMin: 60, midiMax: 80 },
      enabled: true,
      active: true,
      begin,
      update,
      commit,
      cancel,
    }),
  );
  const pointer = async (type: string, x: number, y: number) => {
    const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    await act(async () => {
      canvas.dispatchEvent(event);
    });
    return event;
  };
  expect(
    hook.result.current(
      new PointerEvent("pointerdown", { isPrimary: true, clientX: 500, clientY: 300 }),
    ),
  ).toBe(true);
  expect(
    hook.result.current(
      new PointerEvent("pointerdown", { isPrimary: true, clientX: 1000, clientY: 275 }),
    ),
  ).toBe(false);
  await pointer("pointerdown", 500, 300);
  await pointer("pointermove", 1300, 250);
  expect(begin).toHaveBeenCalledWith(1);
  expect(update).toHaveBeenLastCalledWith(1, 0.98, 1);
  await pointer("pointerup", 1300, 250);
  expect(commit).toHaveBeenCalledOnce();
  await pointer("pointerdown", 500, 300);
  await pointer("pointermove", 600, 200);
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(cancel).toHaveBeenCalledOnce();
});

it("cancels a drag when editing becomes unavailable and ignores late movement", async () => {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 500);
  const note = { midi: 69, name: "A4", start: 0, duration: 1 };
  const selected: NoteItem = {
    id: 1,
    source: { start: 0, end: 1 },
    note,
    raw: note,
    automatic: note,
    muted: false,
    editState: { ids: [], axes: [], differingAxes: [] },
  };
  const points = [
    { position: 0, offset: -3 },
    { position: 0.5, offset: -1 },
    { position: 1, offset: 0 },
  ];
  const update = vi.fn(),
    cancel = vi.fn(),
    commit = vi.fn();
  const rollRef = { current: canvas };
  const hook = renderHook(
    ({ enabled }) =>
      useBendDrag({
        rollRef,
        selected,
        points,
        view: { tMin: 0, tMax: 1, midiMin: 60, midiMax: 80 },
        enabled,
        active: true,
        begin: vi.fn(),
        update,
        cancel,
        commit,
      }),
    { initialProps: { enabled: true } },
  );
  const pointer = async (type: string) => {
    const event = new MouseEvent(type, { clientX: 500, clientY: 300 });
    Object.defineProperty(event, "pointerId", { value: 1 });
    await act(async () => {
      canvas.dispatchEvent(event);
    });
  };
  await pointer("pointerdown");
  hook.rerender({ enabled: false });
  expect(cancel).toHaveBeenCalledOnce();
  await pointer("pointermove");
  await pointer("pointerup");
  expect(cancel).toHaveBeenCalledOnce();
  expect(update).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
