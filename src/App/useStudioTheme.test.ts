import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioTheme } from "./useStudioTheme";
import type { ColorScheme, StudioTheme } from "../Theme/ThemeConfig";

afterEach(cleanup);

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
