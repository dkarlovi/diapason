import { encodeTheme } from "./ThemeConfig";
import type { ThemeSeeds } from "./ThemeConfig";
import type { HostThemeMessage } from "./ThemeMessage.type";

const cached = new WeakMap<HTMLElement, { signature: string; message: HostThemeMessage }>();

function cssColor(host: HTMLElement, value: string): string | undefined {
  if (!value.trim()) return;
  const probe = document.createElement("span");
  probe.style.cssText = "position: absolute; visibility: hidden; pointer-events: none";
  probe.style.color = value;
  if (!probe.style.color) return;
  (host.shadowRoot ?? host).append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const rgb =
    /^rgba?\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)(?:,\s*[\d.]+)?\)$/.exec(color);
  if (rgb)
    return (
      "#" +
      rgb
        .slice(1, 4)
        .map((channel) => Math.round(Number(channel)).toString(16).padStart(2, "0"))
        .join("")
    );
  // Modern CSS color spaces retain their notation in computed styles; canvas converts to sRGB.
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.fillStyle = color.replace(/\s*\/[^)]*(?=\)$)/, " / 1");
  context.fillRect(0, 0, 1, 1);
  return (
    "#" +
    Array.from(context.getImageData(0, 0, 1, 1).data.subarray(0, 3), (channel) =>
      channel.toString(16).padStart(2, "0"),
    ).join("")
  );
}

export function readCssTheme(host: HTMLElement): HostThemeMessage {
  const style = getComputedStyle(host);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  const roles = ["primary", "neutral", "secondary"] as const;
  const values = roles.map((role) => style.getPropertyValue(`--diapason-${role}`));
  const signature = JSON.stringify([values, style.color, style.colorScheme, prefersDark]);
  const previous = cached.get(host);
  if (previous?.signature === signature) return previous.message;
  const colors: Partial<ThemeSeeds> = {};
  for (const [index, role] of roles.entries()) {
    const color = cssColor(host, values[index]!);
    if (color) colors[role] = color;
  }
  const modes = style.colorScheme.split(/\s+/);
  const scheme =
    modes.includes("dark") && !modes.includes("light")
      ? "dark"
      : modes.includes("light") && !modes.includes("dark")
        ? "light"
        : prefersDark
          ? "dark"
          : "light";
  const message: HostThemeMessage = {
    type: "diapason:theme",
    theme: colors.primary ? encodeTheme({ light: { ...colors, primary: colors.primary } }) : null,
    scheme,
  };
  cached.set(host, { signature, message });
  return message;
}
