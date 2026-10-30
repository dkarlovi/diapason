import { useLayoutEffect, useMemo } from "react";
import { generateTheme } from "../Theme/ThemePalette";
import type { ColorScheme, StudioTheme } from "../Theme/ThemeConfig";

/** Root ownership keeps portaled menus, native controls, and charts in sync. */
export function useStudioTheme(theme: StudioTheme | undefined, scheme: ColorScheme) {
  const palette = useMemo(() => generateTheme(theme), [theme]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousId = root.dataset.studioTheme;
    const values: Array<readonly [string, string]> = Object.entries(palette.light).map(
      ([key, light]) =>
        [
          `--color-${key}`,
          `light-dark(${light}, ${palette.dark[key as keyof typeof palette.dark]})`,
        ] as const,
    );
    values.push(["color-scheme", scheme === "auto" ? "light dark" : scheme]);
    const previous = values.map(
      ([name]) =>
        [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)] as const,
    );
    for (const [name, value] of values) root.style.setProperty(name, value);
    root.dataset.studioTheme = JSON.stringify(theme ?? "default");
    window.dispatchEvent(new Event("studio-theme-change"));
    return () => {
      for (const [name, value, priority] of previous) {
        if (value) root.style.setProperty(name, value, priority);
        else root.style.removeProperty(name);
      }
      if (previousId === undefined) delete root.dataset.studioTheme;
      else root.dataset.studioTheme = previousId;
    };
  }, [palette, scheme, theme]);
}
