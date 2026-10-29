import {
  argbFromHex,
  DynamicScheme,
  Hct,
  hexFromArgb,
  TonalPalette,
  SchemeTonalSpot,
} from "@material/material-color-utilities";
import type { StudioTheme, ThemeSeeds } from "./theme-config";

const DEFAULT_SEEDS: ThemeSeeds = {
  primary: "#0072b1",
  neutral: "#64748b",
  secondary: "#a16a12",
};

function palette(seed: string, chroma: number) {
  const color = Hct.fromInt(argbFromHex(seed));
  return TonalPalette.fromHueAndChroma(color.hue, Math.min(color.chroma, chroma));
}

function scheme(seeds: ThemeSeeds, isDark: boolean) {
  return new DynamicScheme({
    ...new SchemeTonalSpot(Hct.fromInt(argbFromHex(seeds.primary)), isDark, 0),
    ...(seeds.neutral
      ? {
          neutralPalette: palette(seeds.neutral, 6),
          neutralVariantPalette: palette(seeds.neutral, 8),
        }
      : {}),
    ...(seeds.secondary ? { tertiaryPalette: palette(seeds.secondary, 32) } : {}),
  });
}

function tokens(seeds: ThemeSeeds, dark: boolean) {
  const colors = scheme(seeds, dark);
  const hex = hexFromArgb;
  return {
    background: hex(colors.surface),
    foreground: hex(colors.onSurface),
    card: hex(dark ? colors.surfaceContainerLow : colors.neutralPalette.tone(99)),
    muted: hex(colors.neutralPalette.tone(dark ? 4 : 95)),
    border: hex(colors.outlineVariant),
    "input-border": hex(colors.neutralVariantPalette.tone(dark ? 65 : 45)),
    "muted-foreground": hex(colors.onSurfaceVariant),
    primary: hex(colors.primary),
    "primary-foreground": hex(colors.onPrimary),
    "primary-muted": hex(colors.primaryContainer),
    playback: hex(colors.tertiary),
    "playback-muted": hex(colors.tertiaryContainer),
    destructive: hex(colors.error),
    "destructive-foreground": hex(colors.onError),
    warning: hex(TonalPalette.fromHueAndChroma(80, 32).tone(dark ? 80 : 35)),
    success: hex(TonalPalette.fromHueAndChroma(145, 32).tone(dark ? 80 : 35)),
    ring: hex(colors.primary),
  };
}

export type ThemeTokens = ReturnType<typeof tokens>;

/** Generate off the rendering hot path. Each mode resolves its own role pairs. */
export function generateTheme(theme?: StudioTheme): { light: ThemeTokens; dark: ThemeTokens } {
  return {
    light: tokens(theme?.light ?? theme?.dark ?? DEFAULT_SEEDS, false),
    dark: tokens(theme?.dark ?? theme?.light ?? DEFAULT_SEEDS, true),
  };
}
