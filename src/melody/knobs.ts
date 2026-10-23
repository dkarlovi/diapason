export type GridSubdivision = 0 | 1 | 2 | 3 | 4;
export type HarmonyRate = "bar" | "half-bar" | "beat";
export interface Knobs {
  pitchTrust: number;
  stickiness: number;
  slipMs: number;
  minNoteMs: number;
  silenceGapMs: number;
  clarityGate: number;
  levelGate: number;
  modeBias: number;
  keyPull: number;
  harmonyPull: number;
  keepOddNotes: number;
  leapPenalty: number;
  maxMoveSemitones: number;
  gridPull: number;
  swing: number;
  syncopation: number;
  articulation: number;
  grid: GridSubdivision;
  harmonyRate: HarmonyRate;
}
export type KnobFamily = "listening" | "key" | "shape" | "rhythm";
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
export const KNOB_DEFS: readonly KnobDef[] = [
  {
    key: "pitchTrust",
    label: "Trust what I sang",
    family: "listening",
    tip: "Balance sung pitch against musical context.",
    basic: false,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "stickiness",
    label: "Stickiness",
    family: "listening",
    tip: "Keep held notes steady.",
    basic: true,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "slipMs",
    label: "Absorb slips",
    family: "listening",
    tip: "Absorb shorter pitch excursions.",
    basic: false,
    kind: "range",
    min: 0,
    max: 250,
    step: 5,
  },
  {
    key: "minNoteMs",
    label: "Minimum note length",
    family: "listening",
    tip: "Discard notes shorter than this many milliseconds.",
    basic: false,
    kind: "range",
    min: 20,
    max: 300,
    step: 5,
  },
  {
    key: "silenceGapMs",
    label: "Silence gap",
    family: "listening",
    tip: "Separate repeated notes after this much silence.",
    basic: false,
    kind: "range",
    min: 30,
    max: 300,
    step: 5,
  },
  {
    key: "clarityGate",
    label: "Clarity gate",
    family: "listening",
    tip: "Require a clear pitch.",
    basic: false,
    kind: "range",
    min: 0.85,
    max: 0.999,
    step: 0.001,
  },
  {
    key: "levelGate",
    label: "Level gate",
    family: "listening",
    tip: "Ignore sound below this level.",
    basic: false,
    kind: "range",
    min: 0.001,
    max: 0.1,
    step: 0.001,
  },
  {
    key: "modeBias",
    label: "Darker ↔ Brighter",
    family: "key",
    tip: "Prefer minor or major; beyond halfway selects the parallel mode.",
    basic: true,
    kind: "range",
    min: -1,
    max: 1,
    step: 0.01,
  },
  {
    key: "keyPull",
    label: "Pull into key",
    family: "key",
    tip: "Favour notes belonging to the key.",
    basic: true,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "harmonyPull",
    label: "Follow harmony",
    family: "key",
    tip: "Favour notes in the implied chord.",
    basic: false,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "keepOddNotes",
    label: "Keep odd notes",
    family: "key",
    tip: "Let confidently sung chromatic notes resist correction.",
    basic: false,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "leapPenalty",
    label: "Smooth leaps",
    family: "shape",
    tip: "Prefer smaller melodic steps.",
    basic: false,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "maxMoveSemitones",
    label: "Maximum pitch move",
    family: "shape",
    tip: "Limit correction distance in semitones.",
    basic: false,
    kind: "range",
    min: 0,
    max: 4,
    step: 1,
  },
  {
    key: "gridPull",
    label: "Pull onto grid",
    family: "rhythm",
    tip: "Blend performed timing with snapped timing.",
    basic: false,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "swing",
    label: "Swing",
    family: "rhythm",
    tip: "Delay alternate subdivisions.",
    basic: false,
    kind: "range",
    min: 0,
    max: 0.5,
    step: 0.01,
  },
  {
    key: "syncopation",
    label: "Syncopation",
    family: "rhythm",
    tip: "Anticipate alternate beats.",
    basic: false,
    kind: "range",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "articulation",
    label: "Note length",
    family: "rhythm",
    tip: "Shorten notes or extend them toward the next onset.",
    basic: false,
    kind: "range",
    min: 0.5,
    max: 1.2,
    step: 0.01,
  },
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
    stickiness: 0.7,
    keyPull: 1,
    harmonyPull: 0.4,
    slipMs: 180,
  }),
  "keep-odd": preset(
    "keep-odd",
    "Keep my odd notes",
    "intent",
    "Clean slips while keeping deliberate surprises.",
    { pitchTrust: 0.8, keepOddNotes: 1, keyPull: 0.3 },
  ),
  happy: preset("happy", "Happy", "mood", "A brighter version of the tune.", {}),
  sad: preset("sad", "Sad", "mood", "A darker version of the tune.", {}),
  dreamy: preset("dreamy", "Dreamy", "mood", "Smooth movement and flowing notes.", {}),
  syncopated: preset(
    "syncopated",
    "Syncopated",
    "mood",
    "Anticipated beats with a rhythmic lift.",
    {},
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
