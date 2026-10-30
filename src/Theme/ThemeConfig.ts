import { fromBase64Url, toBase64Url } from "../Encoding/Base64Url";

export interface ThemeSeeds {
  primary: string;
  neutral?: string;
  secondary?: string;
}

export interface StudioTheme {
  light?: ThemeSeeds;
  dark?: ThemeSeeds;
}

export type ColorScheme = "auto" | "light" | "dark";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function seeds(value: unknown): ThemeSeeds | undefined {
  if (!object(value)) return;
  const result: Partial<ThemeSeeds> = {};
  for (const key of ["primary", "neutral", "secondary"] as const) {
    const color = value[key];
    if (color === undefined && key !== "primary") continue;
    if (typeof color !== "string" || !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) return;
    result[key] = color.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3").toLowerCase();
  }
  return result as ThemeSeeds;
}

const MODES = ["light", "dark"] as const;
const ROLES = ["primary", "neutral", "secondary"] as const;

/** Version 1: version byte, six presence bits, then occupied RGB slots. */
export function encodeTheme(theme: StudioTheme): string {
  const bytes = [1, 0];
  for (const [modeIndex, mode] of MODES.entries()) {
    if (theme[mode] === undefined) continue;
    const normalized = seeds(theme[mode]);
    if (!normalized) throw new Error("Invalid theme seeds");
    for (const [roleIndex, role] of ROLES.entries()) {
      const color = normalized[role];
      if (!color) continue;
      bytes[1] = bytes[1]! | (1 << (modeIndex * 3 + roleIndex));
      for (const offset of [1, 3, 5]) bytes.push(parseInt(color.slice(offset, offset + 2), 16));
    }
  }
  if (!bytes[1]) throw new Error("A theme needs at least one primary seed");
  return toBase64Url(Uint8Array.from(bytes));
}

/** Decode one validated mode and return the next RGB offset. */
function unpackSeeds(bytes: Uint8Array, present: number, start: number): [ThemeSeeds, number] {
  const colors: Partial<ThemeSeeds> = {};
  let offset = start;
  for (const [roleIndex, role] of ROLES.entries()) {
    if (!(present & (1 << roleIndex))) continue;
    colors[role] =
      "#" +
      Array.from(bytes.subarray(offset, offset + 3), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    offset += 3;
  }
  return [colors as ThemeSeeds, offset];
}

/** Invalid versions, masks, lengths, and noncanonical encodings use the default. */
export function parseTheme(value: string | null): StudioTheme | undefined {
  if (!value || value.length < 7 || value.length > 27) return;
  try {
    const bytes = fromBase64Url(value, 27);
    const mask = bytes[1]!;
    if (bytes[0] !== 1 || mask === 0 || mask > 63) return;
    const count = mask.toString(2).replaceAll("0", "").length;
    if (bytes.length !== 2 + count * 3) return;
    const theme: StudioTheme = {};
    let offset = 2;
    for (const [modeIndex, mode] of MODES.entries()) {
      const present = (mask >> (modeIndex * 3)) & 7;
      if (!present) continue;
      if (!(present & 1)) return;
      [theme[mode], offset] = unpackSeeds(bytes, present, offset);
    }
    return offset === bytes.length ? theme : undefined;
  } catch {
    return;
  }
}

export function parseColorScheme(value: string | null): ColorScheme {
  return value === "light" || value === "dark" ? value : "auto";
}
