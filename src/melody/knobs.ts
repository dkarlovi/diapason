export type GridSubdivision = 0 | 1 | 2 | 3 | 4;
export type HarmonyRate = "bar" | "half-bar" | "beat";
type NumericKnob =
  | "pitchTrust"
  | "stickiness"
  | "slipMs"
  | "minNoteMs"
  | "silenceGapMs"
  | "clarityGate"
  | "levelGate"
  | "modeBias"
  | "keyPull"
  | "harmonyPull"
  | "keepOddNotes"
  | "leapPenalty"
  | "maxMoveSemitones"
  | "gridPull"
  | "swing"
  | "syncopation"
  | "articulation";
export interface Knobs extends Record<NumericKnob, number> {
  grid: GridSubdivision;
  harmonyRate: HarmonyRate;
}
type KnobFamily = "listening" | "key" | "shape" | "rhythm";
interface KnobBase {
  key: keyof Knobs;
  label: string;
  family: KnobFamily;
  tip: string;
  basic: boolean;
}
export type KnobDef =
  | (KnobBase & { kind: "range"; min: number; max: number; step: number })
  | (KnobBase & { kind: "select"; options: { value: string | number; label: string }[] });
const RANGE_GROUPS: Record<
  KnobFamily,
  Partial<Record<NumericKnob, [string, string, number, number, number]>>
> = {
  listening: {
    pitchTrust: ["Trust what I sang", "Pitch vs context.", 0, 1, 0.01],
    stickiness: ["Stickiness", "Keep held notes steady.", 0, 1, 0.01],
    slipMs: ["Absorb slips", "Absorb shorter pitch excursions.", 0, 250, 5],
    minNoteMs: ["Minimum note length", "Minimum length, ms.", 20, 300, 5],
    silenceGapMs: ["Silence gap", "Split after silence.", 30, 300, 5],
    clarityGate: ["Clarity gate", "Require a clear pitch.", 0.85, 0.999, 0.001],
    levelGate: ["Level gate", "Minimum level.", 0.001, 0.1, 0.001],
  },
  key: {
    modeBias: ["Darker ↔ Brighter", "Halfway forces mode.", -1, 1, 0.01],
    keyPull: ["Pull into key", "Favour notes belonging to the key.", 0, 1, 0.01],
    harmonyPull: ["Follow harmony", "Favour notes in the implied chord.", 0, 1, 0.01],
    keepOddNotes: ["Keep odd notes", "Protect sung notes.", 0, 1, 0.01],
  },
  shape: {
    leapPenalty: ["Smooth leaps", "Prefer smaller melodic steps.", 0, 1, 0.01],
    maxMoveSemitones: ["Max pitch move", "Semitone limit.", 0, 4, 1],
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
      tip,
      min,
      max,
      step,
      kind: "range",
      basic: ["stickiness", "keyPull", "modeBias"].includes(key),
    })),
  ),
  {
    key: "grid",
    label: "Timing grid",
    family: "rhythm",
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
    key: "harmonyRate",
    label: "Harmony changes",
    family: "key",
    tip: "How often the implied chord may change.",
    basic: false,
    kind: "select",
    options: [
      { value: "bar", label: "Each bar" },
      { value: "half-bar", label: "Each half bar" },
      { value: "beat", label: "Each beat" },
    ],
  },
];
export type IntentPresetId = "as-played" | "gentle" | "clean" | "keep-odd";
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
  pitchTrust: 0.65,
  stickiness: 0.5,
  slipMs: 150,
  minNoteMs: 80,
  silenceGapMs: 90,
  clarityGate: 0.9,
  levelGate: 0.003,
  modeBias: 0,
  keyPull: 0.6,
  harmonyPull: 0.2,
  keepOddNotes: 0.6,
  leapPenalty: 0.1,
  maxMoveSemitones: 2,
  gridPull: 1,
  swing: 0,
  syncopation: 0,
  articulation: 1,
  grid: 0,
  harmonyRate: "bar",
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
// Initial weights; listening gates determine the final defaults and mood settings.
export const PRESETS: Record<PresetId, Preset> = {
  "as-played": preset("as-played", "As played", "intent", "Keep my pitches and timing.", {
    pitchTrust: 1,
    keyPull: 0,
    harmonyPull: 0,
    leapPenalty: 0,
    maxMoveSemitones: 0,
    slipMs: 60,
  }),
  gentle: preset("gentle", "Gentle fix", "intent", "Steady held notes and soften slips.", {}),
  clean: preset("clean", "Clean", "intent", "Use stronger musical guidance.", {
    pitchTrust: 0.4,
    stickiness: 1,
    keyPull: 1,
    harmonyPull: 0.4,
    slipMs: 250,
    grid: 2,
  }),
  "keep-odd": preset(
    "keep-odd",
    "Keep my odd notes",
    "intent",
    "Clean slips while keeping deliberate surprises.",
    { pitchTrust: 0.8, keepOddNotes: 1, keyPull: 0.3 },
  ),
  happy: preset("happy", "Happy", "mood", "A brighter version of the tune.", {
    modeBias: 1,
    pitchTrust: 0.4,
    stickiness: 1,
    slipMs: 250,
  }),
  sad: preset("sad", "Sad", "mood", "A darker version of the tune.", {
    modeBias: -1,
    pitchTrust: 0.4,
    stickiness: 1,
    slipMs: 250,
  }),
  dreamy: preset("dreamy", "Dreamy", "mood", "Smooth movement and flowing notes.", {
    pitchTrust: 0.3,
    stickiness: 1,
    slipMs: 250,
    leapPenalty: 1,
    articulation: 1.2,
    gridPull: 0.1,
  }),
  syncopated: preset(
    "syncopated",
    "Syncopated",
    "mood",
    "Anticipated beats with a rhythmic lift.",
    { pitchTrust: 0.4, stickiness: 1, slipMs: 250, grid: 2, gridPull: 1, syncopation: 1 },
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
