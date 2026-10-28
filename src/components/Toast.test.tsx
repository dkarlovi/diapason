import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import { Toast } from "./Toast";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("links to the saved recording and pauses dismissal while the action has focus", () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  render(
    <MemoryRouter>
      <Toast
        notice={{
          kind: "success",
          message: "Recording saved",
          action: { label: "Open", to: "/recording/new-take" },
        }}
        onDismiss={dismiss}
      />
    </MemoryRouter>,
  );
  const link = screen.getByRole("link", { name: "Open" });
  expect(link.getAttribute("href")).toBe("/recording/new-take");
  fireEvent.focus(link);
  act(() => vi.advanceTimersByTime(20000));
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.blur(link);
  act(() => vi.advanceTimersByTime(8000));
  expect(dismiss).toHaveBeenCalledOnce();
});
it("announces errors urgently and allows manual dismissal", () => {
  const dismiss = vi.fn();
  render(
    <Toast
      notice={{ kind: "error", message: "Save failed — record again to retry." }}
      onDismiss={dismiss}
    />,
  );
  expect(screen.getByRole("alert").textContent).toContain("Save failed");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  expect(dismiss).toHaveBeenCalledOnce();
});
