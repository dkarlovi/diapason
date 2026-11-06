import { parseTheme } from "./ThemeConfig";
import type { HostThemeUpdate } from "./ThemeMessage.type";
import { hasProperties } from "../Encoding/Properties";

export function readThemeMessage(value: unknown): HostThemeUpdate | undefined {
  if (!hasProperties(value, "type", "scheme", "theme")) return;
  const message = value;
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
