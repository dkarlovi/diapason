import type { Recording } from "../Recording/Recording.type";
import {
  PRESETS,
  KNOB_DEFS,
  isKnobs,
  DEFAULT_PRESET,
  type Knobs,
  type PresetId,
  type GridSubdivision,
} from "./knobs";
import type { KeyChoice } from "./interpret";
export interface MelodySetting {
  preset: PresetId;
  overrides: Partial<Knobs>;
  key: KeyChoice;
}

/** Compare recipes, including explicit overrides, without relying on property order. */
export function sameMelodySetting(left: MelodySetting, right: MelodySetting): boolean {
  const recipe = (setting: MelodySetting) => [
    setting.preset,
    setting.key === "auto" ? "auto" : [setting.key.tonic, setting.key.mode],
    Object.entries(setting.overrides).sort(([a], [b]) => a.localeCompare(b)),
  ];
  return JSON.stringify(recipe(left)) === JSON.stringify(recipe(right));
}
export function newRecordingMelody(levelGate: number): MelodySetting {
  return {
    preset: DEFAULT_PRESET,
    overrides: { levelGate: Math.max(0.001, Math.min(0.1, levelGate)) },
    key: "auto",
  };
}
// Knobs are retired as the engine evolves; overrides saved for them are ignored.
function knownKnobs(overrides: Partial<Knobs>): Partial<Knobs> {
  return Object.fromEntries(
    Object.entries(overrides).filter(([key]) => KNOB_DEFS.some((def) => def.key === key)),
  );
}
export function melodySettingFor(record: Recording): MelodySetting {
  if (record.melody) return { ...record.melody, overrides: knownKnobs(record.melody.overrides) };
  const legacy = record.tuning ?? {};
  const overrides: Partial<Knobs> = {};
  if (legacy.rmsGate !== undefined) overrides.levelGate = legacy.rmsGate;
  if (legacy.minDurationSec !== undefined) overrides.minNoteMs = legacy.minDurationSec * 1000;
  if (legacy.silenceGapSec !== undefined) overrides.silenceGapMs = legacy.silenceGapSec * 1000;
  if (record.quantize) {
    overrides.grid = (record.quantize.on ? record.quantize.subdivision : 0) as GridSubdivision;
    overrides.gridPull = 1;
  }
  return { preset: DEFAULT_PRESET, key: "auto", overrides };
}

export function isMelodySetting(value: unknown): value is MelodySetting {
  if (!value || typeof value !== "object") return false;
  const setting = value as Record<string, unknown>;
  if (
    typeof setting.preset !== "string" ||
    !Object.hasOwn(PRESETS, setting.preset) ||
    !isKnobs(setting.overrides)
  )
    return false;
  if (setting.key === "auto") return true;
  if (!setting.key || typeof setting.key !== "object") return false;
  const key = setting.key as Record<string, unknown>;
  return (
    Number.isInteger(key.tonic) &&
    Number(key.tonic) >= 0 &&
    Number(key.tonic) < 12 &&
    (key.mode === "major" || key.mode === "minor")
  );
}
