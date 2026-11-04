import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioTheme } from "./useStudioTheme";
import type { ColorScheme, StudioTheme } from "../Theme/ThemeConfig";

afterEach(cleanup);

it("updates an embedded studio from its parent without replacing its content", () => {
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal("parent", parent);
  try {
    const { result } = renderHook(() => useStudioTheme(undefined, "light", true));
    const before = document.documentElement.style.getPropertyValue("--color-primary");
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: parent as unknown as Window,
          data: { type: "diapason:theme", theme: "AQGqu8w", scheme: "dark" },
        }),
      );
    });
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.documentElement.dataset.studioTheme).toBe('{"light":{"primary":"#aabbcc"}}');
    expect(document.documentElement.style.getPropertyValue("--color-primary")).not.toBe(before);
    expect(result.current).toBeUndefined();
  } finally {
    vi.unstubAllGlobals();
  }
});

it.each([false, true])(
  "ignores unrelated senders and malformed messages (embedded=%s)",
  (embedded) => {
    renderHook(() => useStudioTheme(undefined, "light", embedded));
    const messages: Array<[unknown, unknown]> = [
      [{}, { type: "diapason:theme", theme: "AQGqu8w", scheme: "dark" }],
      [window.parent, { type: "diapason:theme", theme: "bad", scheme: "dark" }],
    ];
    if (!embedded)
      messages.push([window.parent, { type: "diapason:theme", theme: "AQGqu8w", scheme: "dark" }]);
    for (const [source, data] of messages) {
      act(() =>
        window.dispatchEvent(
          new MessageEvent<unknown>("message", { source: source as Window, data }),
        ),
      );
    }
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(document.documentElement.dataset.studioTheme).toBe('"default"');
  },
);

it("applies shared root tokens and restores previous styles when unmounted", () => {
  const root = document.documentElement;
  root.style.setProperty("--color-primary", "rebeccapurple");
  const { unmount } = renderHook(() => useStudioTheme(undefined, "dark"));
  expect(root.style.colorScheme).toBe("dark");
  expect(root.style.getPropertyValue("--color-primary")).toMatch(
    /light-dark\(#[\da-f]{6}, #[\da-f]{6}\)/,
  );
  expect(root.dataset.studioTheme).toBeTruthy();
  unmount();
  expect(root.style.getPropertyValue("--color-primary")).toBe("rebeccapurple");
  expect(root.style.colorScheme).toBe("");
  expect(root.dataset.studioTheme).toBeUndefined();
  root.style.removeProperty("--color-primary");
});

it("replaces tokens and notifies charts when seeds or effective scheme change", () => {
  const listener = vi.fn();
  window.addEventListener("studio-theme-change", listener);
  try {
    const root = document.documentElement;
    const { rerender } = renderHook(
      ({ theme, scheme }: { theme: StudioTheme | undefined; scheme: ColorScheme }) =>
        useStudioTheme(theme, scheme),
      { initialProps: { theme: undefined, scheme: "light" } },
    );
    const before = root.style.getPropertyValue("--color-primary");
    rerender({ theme: { dark: { primary: "#008800" } }, scheme: "auto" });
    expect(root.style.getPropertyValue("--color-primary")).not.toBe(before);
    expect(root.style.colorScheme).toBe("light dark");
    expect(listener).toHaveBeenCalledTimes(2);
  } finally {
    window.removeEventListener("studio-theme-change", listener);
  }
});
