import type { InterpretationVersion } from "./Decode.type";
import { PackageError } from "../Recording/PackageError";
export type GridSubdivision = 0 | 1 | 2 | 3 | 4;
export type Mode = "auto" | "major" | "minor";
type NumericKnob =
  | "glide"
  | "steadiness"
  | "minNoteMs"
  | "silenceGapMs"
  | "levelGate"
  | "keyPull"
  | "contextCorrection"
  | "leapPenalty"
  | "maxMoveSemitones"
  | "gridPull"
  | "swing"
  | "syncopation"
  | "articulation";
export interface Knobs extends Record<NumericKnob, number> {
  grid: GridSubdivision;
  mode: Mode;
}
type KnobFamily = "listening" | "key" | "shape" | "rhythm";
interface KnobBase {
  key: keyof Knobs;
  label: string;
  family: KnobFamily;
  tip: string;
  basic: boolean;
  requires: "analysis" | "musicalPitch" | "musicalTiming";
}
export type KnobDef =
  | (KnobBase & { kind: "range"; min: number; max: number; step: number })
  | (KnobBase & { kind: "select"; options: { value: string | number; label: string }[] });
const RANGE_GROUPS: Record<
  KnobFamily,
  Partial<Record<NumericKnob, [string, string, number, number, number]>>
> = {
  listening: {
    steadiness: ["Steadiness", "Keep held notes whole; absorb short slips.", 0, 1, 0.01],
    minNoteMs: ["Minimum note length", "Minimum length, ms.", 20, 300, 5],
    silenceGapMs: ["Silence gap", "Bridge pitch dropouts shorter than this, ms.", 30, 300, 5],
    levelGate: ["Level gate", "Minimum level.", 0.001, 0.1, 0.001],
  },
  key: {
    keyPull: ["Pull into key", "From exactly what I whistled to always in key.", 0, 1, 0.01],
    contextCorrection: [
      "Context correction",
      "Use the key, implied harmony and melodic steps to correct pitches; may change deliberate odd notes.",
      0,
      1,
      0.01,
    ],
  },
  shape: {
    glide: [
      "Glide",
      "Fixed notes, stepped slides, then smooth bends. Above Fine, higher values give bends more time.",
      0,
      1,
      0.01,
    ],
    leapPenalty: ["Smooth leaps", "Prefer smaller melodic steps.", 0, 1, 0.01],
    maxMoveSemitones: [
      "Max pitch move",
      "Move notes that clash with the implied chord onto it, up to this many semitones.",
      0,
      4,
      1,
    ],
  },
  rhythm: {
    gridPull: ["Pull onto grid", "Timing blend.", 0, 1, 0.01],
    swing: ["Swing", "Delay alternate subdivisions.", 0, 0.5, 0.01],
    syncopation: ["Syncopation", "Anticipate alternate beats.", 0, 1, 0.01],
    articulation: ["Note length", "Detached to legato.", 0.5, 1.2, 0.01],
  },
};
export const KNOB_DEFS: readonly KnobDef[] = [
  ...Object.entries(RANGE_GROUPS).flatMap(([family, definitions]) =>
    Object.entries(definitions).map(([key, [label, tip, min, max, step]]): KnobDef => ({
      key: key as NumericKnob,
      label,
      family: family as KnobFamily,
      requires:
        family === "listening"
          ? "analysis"
          : family === "rhythm"
            ? "musicalTiming"
            : "musicalPitch",
      tip,
      min,
      max,
      step,
      kind: "range",
      basic: ["steadiness", "keyPull", "contextCorrection", "glide"].includes(key),
    })),
  ),
  {
    key: "grid",
    label: "Timing grid",
    family: "rhythm",
    requires: "musicalTiming",
    tip: "Choose subdivisions per beat, or preserve performed timing.",
    basic: true,
    kind: "select",
    options: [
      { value: 0, label: "Off" },
      { value: 1, label: "Quarter notes" },
      { value: 2, label: "Eighth notes" },
      { value: 3, label: "Triplets" },
      { value: 4, label: "Sixteenth notes" },
    ],
  },
  {
    key: "mode",
    label: "Mode",
    family: "key",
    requires: "musicalPitch",
    tip: "Keep the detected mode, or recast the tune in major or minor.",
    basic: true,
    kind: "select",
    options: [
      { value: "auto", label: "As detected" },
      { value: "major", label: "Major" },
      { value: "minor", label: "Minor" },
    ],
  },
];
type IntentPresetId = "as-played" | "auto-pitch" | "auto-timing" | "auto-tune";
type MoodPresetId = "auto-major" | "auto-minor" | "auto-syncopated";
type RetiredPresetId = "gentle" | "clean" | "keep-odd" | "happy" | "sad" | "dreamy" | "syncopated";
export type PresetId = IntentPresetId | MoodPresetId | RetiredPresetId;
export const DEFAULT_PRESET: PresetId = "auto-tune";
/** Retired presets stay resolvable so saved tunes keep their values, but are not offered. */
export interface Preset {
  id: PresetId;
  label: string;
  kind: "intent" | "mood" | "retired";
  blurb: string;
  knobs: Knobs;
}
const BASE: Knobs = {
  glide: 0,
  steadiness: 0.6,
  minNoteMs: 80,
  silenceGapMs: 90,
  levelGate: 0.003,
  keyPull: 0.6,
  contextCorrection: 0,
  mode: "auto",
  leapPenalty: 0.1,
  maxMoveSemitones: 0,
  gridPull: 1,
  swing: 0,
  syncopation: 0,
  articulation: 1,
  grid: 0,
};
function preset(
  id: PresetId,
  label: string,
  kind: Preset["kind"],
  blurb: string,
  overrides: Partial<Knobs>,
): Preset {
  return { id, label, kind, blurb, knobs: { ...BASE, ...overrides } };
}
const AS_PLAYED: Partial<Knobs> = { steadiness: 0.5, keyPull: 0, leapPenalty: 0 };
const AUTO_PITCH: Partial<Knobs> = { steadiness: 1, keyPull: 1, contextCorrection: 1 };
const AUTO_TUNE: Partial<Knobs> = { ...AUTO_PITCH, grid: 2 };
// Saved tunes store a preset id with overrides, so a published recipe is frozen: portable
// interpretation v1 references these defaults and knob steps. Change behaviour with a new id
// and retire the old one, or bump the interpretation version.
export const PRESETS: Record<PresetId, Preset> = {
  "as-played": preset("as-played", "As played", "intent", "Keep my pitches and timing.", AS_PLAYED),
  "auto-pitch": preset(
    "auto-pitch",
    "Auto pitch",
    "intent",
    "Correct pitches using the key and melodic context; keep my timing.",
    AUTO_PITCH,
  ),
  "auto-timing": preset(
    "auto-timing",
    "Auto timing",
    "intent",
    "Snap timing to the eighth-note grid; keep my pitches.",
    { ...AS_PLAYED, steadiness: 1, grid: 2 },
  ),
  "auto-tune": preset(
    "auto-tune",
    "Auto tune",
    "intent",
    "Correct pitches and snap timing to the eighth-note grid; may change deliberate odd notes.",
    AUTO_TUNE,
  ),
  "auto-major": preset("auto-major", "Major", "mood", "Auto tune, recast in a major key.", {
    ...AUTO_TUNE,
    mode: "major",
  }),
  "auto-minor": preset("auto-minor", "Minor", "mood", "Auto tune, recast in a minor key.", {
    ...AUTO_TUNE,
    mode: "minor",
  }),
  "auto-syncopated": preset(
    "auto-syncopated",
    "Syncopated",
    "mood",
    "Auto tune with alternate beats pushed an eighth early.",
    { ...AUTO_TUNE, syncopation: 1 },
  ),
  gentle: preset("gentle", "Gentle fix (retired)", "retired", "Steady held notes.", {}),
  clean: preset("clean", "Clean (retired)", "retired", "Pull into key on the grid.", {
    steadiness: 1,
    keyPull: 1,
    grid: 2,
  }),
  "keep-odd": preset("keep-odd", "Keep my odd notes (retired)", "retired", "Light key pull.", {
    keyPull: 0.3,
  }),
  happy: preset("happy", "Happy (retired)", "retired", "Major, performed timing.", {
    steadiness: 1,
    keyPull: 1,
    mode: "major",
  }),
  sad: preset("sad", "Sad (retired)", "retired", "Minor, performed timing.", {
    steadiness: 1,
    keyPull: 1,
    mode: "minor",
  }),
  dreamy: preset("dreamy", "Dreamy (retired)", "retired", "Legato, performed timing.", {
    steadiness: 1,
    keyPull: 1,
    leapPenalty: 1,
    articulation: 1.2,
    gridPull: 0.1,
  }),
  syncopated: preset("syncopated", "Syncopated (retired)", "retired", "Clean with a push.", {
    steadiness: 1,
    keyPull: 1,
    grid: 2,
    syncopation: 1,
  }),
};
function validValue(def: KnobDef, value: unknown): boolean {
  return def.kind === "range"
    ? typeof value === "number" && Number.isFinite(value) && value >= def.min && value <= def.max
    : def.options.some((option) => option.value === value);
}
export function resolveKnobs(presetId: PresetId, overrides: Partial<Knobs>): Knobs {
  const knobs = { ...PRESETS[presetId].knobs };
  for (const def of KNOB_DEFS) {
    const value = overrides[def.key];
    if (value !== undefined && validValue(def, value)) Object.assign(knobs, { [def.key]: value });
  }
  return knobs;
}
export function isKnobs(value: unknown): value is Partial<Knobs> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, entry]) => {
    const def = KNOB_DEFS.find((candidate) => candidate.key === key);
    return def !== undefined && validValue(def, entry);
  });
}

/** Historical controls retain their documented neutral values. */
export function withControlDefaults(knobs: Knobs): Knobs {
  return { ...knobs, contextCorrection: knobs.contextCorrection ?? 0, glide: knobs.glide ?? 0 };
}

/** Preserve saved semantics while retaining explicit control membership, including zero. */
export function interpretationVersionForControls(
  knobs: Knobs,
  overrides: Partial<Knobs>,
  version: InterpretationVersion = 4,
): InterpretationVersion {
  if (version === 4) return 4;
  if ((knobs.glide ?? 0) > 0 || overrides.glide !== undefined) return 3;
  if (version === 3) return 3;
  return (knobs.contextCorrection ?? 0) > 0 || overrides.contextCorrection !== undefined
    ? 2
    : version;
}

/** Materialize documented historical fields; never consult today's preset recipe. */
export function historicalControls(
  value: Partial<Knobs>,
  version: InterpretationVersion,
  path = "knobs",
): {
  values: Knobs;
  defaults: { key: keyof Knobs; value: number | string; reason: string }[];
} {
  const values = { ...value };
  const defaults: { key: keyof Knobs; value: number | string; reason: string }[] = [];
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4)
    throw new PackageError("unsupported", path, "controls.version");
  for (const def of KNOB_DEFS) {
    if (values[def.key] === undefined) {
      const reason = historicalControlReason(def.key, version);
      if (!reason)
        throw new PackageError(
          "historical-default",
          `${path}.${def.key}`,
          "controls.historical-default",
        );
      Object.assign(values, { [def.key]: 0 });
      defaults.push({ key: def.key, value: 0, reason });
    }
    if (!validValue(def, values[def.key]))
      throw new PackageError("malformed", `${path}.${def.key}`, "controls.value");
  }
  for (const key of Object.keys(values))
    if (!KNOB_DEFS.some((def) => def.key === key))
      throw new PackageError("malformed", `${path}.${key}`, "controls.known");
  return { values: values as Knobs, defaults };
}

function historicalControlReason(key: keyof Knobs, version: InterpretationVersion): string | null {
  if (key === "contextCorrection" && version === 1)
    return "Interpretation 1 predates Context correction.";
  if (key === "glide" && version < 3) return "Interpretations 1 and 2 predate Glide.";
  return null;
}

/** Knobs that shape note detection; a note source freezes them when it is captured. */
export const DETECTION_KNOBS = ["steadiness", "minNoteMs", "silenceGapMs", "levelGate"] as const;
