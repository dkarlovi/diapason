import { useLayoutEffect, useMemo, useState } from "react";
import { generateTheme } from "../Theme/ThemePalette";
import type { ColorScheme, StudioTheme } from "../Theme/ThemeConfig";
import { readThemeMessage } from "../Theme/ThemeMessage";
import type { HostThemeUpdate } from "../Theme/ThemeMessage.type";

/** Root ownership keeps portaled menus, native controls, and charts in sync. */
export function useStudioTheme(
  theme: StudioTheme | undefined,
  scheme: ColorScheme,
  embedded = false,
) {
  const [host, setHost] = useState<HostThemeUpdate>();
  const effectiveTheme = host ? host.theme : theme;
  const effectiveScheme = host ? host.scheme : scheme;
  const palette = useMemo(() => generateTheme(effectiveTheme), [effectiveTheme]);
  useLayoutEffect(() => {
    if (!embedded) return;
    const receive = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent) return;
      const update = readThemeMessage(event.data);
      if (update) setHost(update);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ type: "diapason:ready" }, "*");
    return () => window.removeEventListener("message", receive);
  }, [embedded]);
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
    values.push(["color-scheme", effectiveScheme === "auto" ? "light dark" : effectiveScheme]);
    const previous = values.map(
      ([name]) =>
        [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)] as const,
    );
    for (const [name, value] of values) root.style.setProperty(name, value);
    root.dataset.studioTheme = JSON.stringify(effectiveTheme ?? "default");
    window.dispatchEvent(new Event("studio-theme-change"));
    return () => {
      for (const [name, value, priority] of previous) {
        if (value) root.style.setProperty(name, value, priority);
        else root.style.removeProperty(name);
      }
      if (previousId === undefined) delete root.dataset.studioTheme;
      else root.dataset.studioTheme = previousId;
    };
  }, [palette, effectiveScheme, effectiveTheme]);
}
