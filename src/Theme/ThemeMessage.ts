import { parseTheme } from "./ThemeConfig";
import type { HostThemeUpdate } from "./ThemeMessage.type";

export function readThemeMessage(value: unknown): HostThemeUpdate | undefined {
  if (!value || typeof value !== "object") return;
  const message = value as Record<string, unknown>;
  if (
    message.type !== "diapason:theme" ||
    (message.scheme !== "light" && message.scheme !== "dark" && message.scheme !== "auto") ||
    (message.theme !== null && typeof message.theme !== "string")
  )
    return;
  const theme = parseTheme(message.theme);
  if (message.theme !== null && !theme) return;
  return { theme, scheme: message.scheme };
}
