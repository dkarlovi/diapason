import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BendProperties } from "./NoteDetail";
import type { EditorState } from "./useEditor";

afterEach(cleanup);
function state(active = 1) {
  return {
    canEditPitch: true,
    bendEditing: {
      points: [
        { position: 0, offset: -3 },
        { position: 0.5, offset: 1 },
        { position: 1, offset: 0 },
      ],
      active,
      setActive: vi.fn(),
      claims: vi.fn(() => false),
      visible: true,
      edited: true,
      changePoint: vi.fn(),
      reset: vi.fn(),
    },
  } satisfies Pick<EditorState, "bendEditing" | "canEditPitch">;
}
it("adjusts a bend's pitch and timing separately and resets its automatic shape", () => {
  const current = state();
  render(<BendProperties state={current} />);
  fireEvent.click(screen.getByRole("button", { name: "Raise bend point" }));
  expect(current.bendEditing.changePoint).toHaveBeenLastCalledWith(0.5, 1.5);
  fireEvent.click(screen.getByRole("button", { name: "Lower bend point" }));
  expect(current.bendEditing.changePoint).toHaveBeenLastCalledWith(0.5, 0.5);
  fireEvent.click(screen.getByRole("button", { name: "Move bend point earlier" }));
  expect(current.bendEditing.changePoint).toHaveBeenLastCalledWith(0.45, 1);
  fireEvent.click(screen.getByRole("button", { name: "Move bend point later" }));
  expect(current.bendEditing.changePoint).toHaveBeenLastCalledWith(0.55, 1);
  fireEvent.click(screen.getByRole("button", { name: "Reset bend" }));
  expect(current.bendEditing.reset).toHaveBeenCalledOnce();
});
it("keeps the first arrival fixed and excludes the destination from editable choices", () => {
  const current = state(0);
  render(<BendProperties state={current} />);
  const earlier = screen.getByRole<HTMLButtonElement>("button", {
    name: "Move bend point earlier",
  });
  const later = screen.getByRole<HTMLButtonElement>("button", { name: "Move bend point later" });
  expect(earlier.disabled).toBe(true);
  expect(later.disabled).toBe(true);
  expect(screen.getAllByRole("option")).toHaveLength(2);
  fireEvent.click(later);
  expect(current.bendEditing.changePoint).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox", { name: "Bend point" }), {
    target: { value: "1" },
  });
  expect(current.bendEditing.setActive).toHaveBeenCalledWith(1);
});
it("retains point selector focus across contour updates and disables unavailable editing", () => {
  const current = state();
  const result = render(<BendProperties state={current} />);
  const select = screen.getByRole("combobox", { name: "Bend point" });
  select.focus();
  result.rerender(
    <BendProperties
      state={{
        ...current,
        bendEditing: {
          ...current.bendEditing,
          points: [
            { position: 0, offset: -3 },
            { position: 0.55, offset: 2 },
            { position: 1, offset: 0 },
          ],
        },
      }}
    />,
  );
  expect(document.activeElement).toBe(select);
  result.rerender(<BendProperties state={{ ...current, canEditPitch: false }} />);
  expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Bend point" }).disabled).toBe(
    true,
  );
  for (const button of screen.getAllByRole<HTMLButtonElement>("button"))
    expect(button.disabled).toBe(true);
});
