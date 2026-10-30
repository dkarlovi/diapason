import { PackageError } from "../Recording/PackageError";
export type GridSubdivision = 0 | 1 | 2 | 3 | 4;
export type Mode = "auto" | "major" | "minor";
type NumericKnob =
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
      basic: ["steadiness", "keyPull", "contextCorrection"].includes(key),
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
export type IntentPresetId = "as-played" | "gentle" | "clean" | "keep-odd" | "auto-tune";
export type MoodPresetId = "happy" | "sad" | "dreamy" | "syncopated";
export type PresetId = IntentPresetId | MoodPresetId;
// Provisional starting point; listening refinement continues in the editor.
export const DEFAULT_PRESET: PresetId = "clean";
export interface Preset {
  id: PresetId;
  label: string;
  kind: "intent" | "mood";
  blurb: string;
  knobs: Knobs;
}
const BASE: Knobs = {
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
// Portable interpretation v1 references these defaults and knob steps.
// Bump its interpretation version before changing their musical semantics.
export const PRESETS: Record<PresetId, Preset> = {
  "as-played": preset("as-played", "As played", "intent", "Keep my pitches and timing.", {
    steadiness: 0.5,
    keyPull: 0,
    leapPenalty: 0,
    maxMoveSemitones: 0,
  }),
  gentle: preset("gentle", "Gentle fix", "intent", "Steady held notes and soften slips.", {}),
  clean: preset("clean", "Clean", "intent", "Use stronger musical guidance.", {
    steadiness: 1,
    keyPull: 1,
    grid: 2,
  }),
  "auto-tune": preset(
    "auto-tune",
    "Auto tune",
    "intent",
    "Correct pitches using the key and melodic context; may change deliberate odd notes.",
    {
      steadiness: 1,
      keyPull: 1,
      contextCorrection: 1,
      grid: 2,
    },
  ),
  "keep-odd": preset(
    "keep-odd",
    "Keep my odd notes",
    "intent",
    "Clean slips while keeping deliberate surprises.",
    { keyPull: 0.3 },
  ),
  happy: preset("happy", "Happy", "mood", "A brighter version of the tune.", {
    steadiness: 1,
    keyPull: 1,
    mode: "major",
  }),
  sad: preset("sad", "Sad", "mood", "A darker version of the tune.", {
    steadiness: 1,
    keyPull: 1,
    mode: "minor",
  }),
  dreamy: preset("dreamy", "Dreamy", "mood", "Smooth movement and flowing notes.", {
    steadiness: 1,
    keyPull: 1,
    leapPenalty: 1,
    articulation: 1.2,
    gridPull: 0.1,
  }),
  syncopated: preset(
    "syncopated",
    "Syncopated",
    "mood",
    "Anticipated beats with a rhythmic lift.",
    { steadiness: 1, keyPull: 1, grid: 2, syncopation: 1 },
  ),
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

/** Historical snapshots predate the explicit Context correction control. */
export function withControlDefaults(knobs: Knobs): Knobs {
  return { ...knobs, contextCorrection: knobs.contextCorrection ?? 0 };
}

/** V1 cannot encode the new control, including an explicit zero override. */
export function interpretationVersionForControls(knobs: Knobs, overrides: Partial<Knobs>): 1 | 2 {
  return (knobs.contextCorrection ?? 0) > 0 || overrides.contextCorrection !== undefined ? 2 : 1;
}

/** Materialize documented historical fields; never consult today's preset recipe. */
export function historicalControls(
  value: Partial<Knobs>,
  version: 1 | 2,
  path = "knobs",
): {
  values: Knobs;
  defaults: { key: keyof Knobs; value: number | string; reason: string }[];
} {
  const values = { ...value };
  const defaults: { key: keyof Knobs; value: number | string; reason: string }[] = [];
  if (version !== 1 && version !== 2)
    throw new PackageError("unsupported", path, "controls.version");
  for (const def of KNOB_DEFS) {
    if (values[def.key] === undefined) {
      if (def.key === "contextCorrection" && version === 1) {
        values.contextCorrection = 0;
        defaults.push({
          key: "contextCorrection",
          value: 0,
          reason: "Interpretation 1 predates Context correction.",
        });
      } else
        throw new PackageError(
          "historical-default",
          `${path}.${def.key}`,
          "controls.historical-default",
        );
    }
    if (!validValue(def, values[def.key]))
      throw new PackageError("malformed", `${path}.${def.key}`, "controls.value");
  }
  for (const key of Object.keys(values))
    if (!KNOB_DEFS.some((def) => def.key === key))
      throw new PackageError("malformed", `${path}.${key}`, "controls.known");
  return { values: values as Knobs, defaults };
}

/** Knobs that shape note detection; a note source freezes them when it is captured. */
export const DETECTION_KNOBS = ["steadiness", "minNoteMs", "silenceGapMs", "levelGate"] as const;
