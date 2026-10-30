import { expect, it } from "vitest";
import { generateTheme } from "./ThemePalette";

// Independent WCAG sRGB luminance calculation: catches mapping errors even when
// the upstream theme engine correctly meets its own, different role pairings.
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

it.each([
  "#ffffff",
  "#000000",
  "#808080",
  "#ffff00",
  "#00ff00",
  "#ff0000",
  "#0000ff",
  "#00ffff",
  "#ff00ff",
  "#0072b1",
])("generates readable, valid studio pairings from %s", (primary) => {
  const theme = generateTheme({ light: { primary, neutral: "#ff00ff", secondary: "#ffff00" } });
  for (const tokens of Object.values(theme)) {
    for (const value of Object.values(tokens)) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    for (const surface of [
      tokens.background,
      tokens.card,
      tokens.muted,
      tokens["primary-muted"],
      tokens["playback-muted"],
    ]) {
      for (const text of [
        tokens.foreground,
        tokens["muted-foreground"],
        tokens.primary,
        tokens.playback,
        tokens.destructive,
        tokens.warning,
        tokens.success,
      ]) {
        expect(contrast(text, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens["input-border"], surface)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(tokens.primary, tokens["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tokens.destructive, tokens["destructive-foreground"])).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrast(tokens.playback, tokens["primary-foreground"])).toBeGreaterThanOrEqual(4.5);
  }
  expect(theme.light.background).not.toBe(theme.dark.background);
});

it("uses the other mode's seeds when a mode is absent and keeps explicit modes independent", () => {
  const light = { primary: "#0072b1" };
  const dark = { primary: "#ad3b56" };
  expect(generateTheme({ light })).toEqual(generateTheme({ dark: light }));
  expect(generateTheme({ light, dark }).light).toEqual(generateTheme({ light }).light);
  expect(generateTheme({ light, dark }).dark).toEqual(generateTheme({ dark }).dark);
});

it("lets neutral and secondary seeds affect their roles without changing the primary family", () => {
  const base = generateTheme({ light: { primary: "#0072b1" } }).light;
  const custom = generateTheme({
    light: { primary: "#0072b1", neutral: "#9d4028", secondary: "#287c4a" },
  }).light;
  expect(custom.background).not.toBe(base.background);
  expect(custom.playback).not.toBe(base.playback);
  expect(custom.primary).toBe(base.primary);
  expect(generateTheme()).toEqual(
    generateTheme({ light: { primary: "#0072b1", neutral: "#64748b", secondary: "#a16a12" } }),
  );
});
