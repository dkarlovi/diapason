import { INSTRUMENTS } from "./instruments";
import {
  DETECTION_KNOBS,
  KNOB_DEFS,
  PRESETS,
  resolveKnobs,
  type Knobs,
  type PresetId,
} from "./melody/knobs";
import { TUNE_LIMITS, validatePortableTune } from "./portable-tune";
import { TuneReader, TuneWriter } from "./tune-binary";
import type { NoteSource } from "./Recording/NoteSource.type";
import type { PortableTune } from "./Tune/PortableTune.type";

// Wire order is frozen for format v1. Never derive instrument/preset codes from UI ordering.
const instruments = ["beep", "epiano", "pluck", "flute", "trumpet", "saxophone", "pad"] as const;
const presets: PresetId[] = [
  "as-played",
  "gentle",
  "clean",
  "keep-odd",
  "happy",
  "sad",
  "dreamy",
  "syncopated",
  "auto-tune",
];
const keys: (keyof Knobs)[] = [
  "steadiness",
  "minNoteMs",
  "silenceGapMs",
  "levelGate",
  "keyPull",
  "leapPenalty",
  "maxMoveSemitones",
  "gridPull",
  "swing",
  "syncopation",
  "articulation",
  "grid",
  "mode",
  "contextCorrection",
];
const controlKeys = (version: NoteSource["interpretationVersion"]) =>
  version === 1 ? keys.slice(0, -1) : keys;
function writeKnob(w: TuneWriter, key: keyof Knobs, value: Knobs[keyof Knobs]) {
  const def = KNOB_DEFS.find((d) => d.key === key)!;
  if (def.kind === "select") {
    w.uint(def.options.findIndex((o) => o.value === value));
    return;
  }
  const code = Math.round((Number(value) - def.min) / def.step);
  if (Number((def.min + code * def.step).toPrecision(14)) === value) {
    w.byte(0);
    w.uint(code);
  } else {
    w.byte(1);
    w.float(Number(value));
  }
}
function readKnob(r: TuneReader, key: keyof Knobs): number | string {
  const def = KNOB_DEFS.find((d) => d.key === key)!;
  if (def.kind === "select") {
    const option = def.options[r.uint()];
    if (!option) throw new Error("Unknown setting");
    return option.value;
  }
  const flag = r.byte();
  if (flag === 1) return r.float();
  if (flag !== 0) throw new Error("Unknown setting flag");
  return Number((def.min + r.uint() * def.step).toPrecision(14));
}
function noteFlags(pitch: number, muted: boolean, edited: boolean, precise: boolean): number {
  return (Number.isInteger(pitch) ? 0 : 1) + (muted ? 2 : 0) + (edited ? 4 : 0) + (precise ? 8 : 0);
}
export function packTune(tune: PortableTune): Uint8Array {
  validatePortableTune(tune);
  const w = new TuneWriter();
  w.text(tune.name);
  w.uint(tune.durationMs);
  w.float(tune.bpm);
  w.uint(tune.beatsPerBar);
  w.byte(presets.indexOf(tune.melody.preset));
  const key = tune.melody.key;
  w.byte(key === "auto" ? 0 : 1 + key.tonic + (key.mode === "minor" ? 12 : 0));
  w.byte(instruments.indexOf(tune.play.instrument) * 8 + tune.play.octave + 3);
  w.float(tune.noteSource.range.minMidi);
  w.float(tune.noteSource.range.maxMidi);
  let mask = 0;
  const controls = controlKeys(tune.noteSource.interpretationVersion);
  controls.forEach((k, i) => {
    if (tune.melody.overrides[k] !== undefined) mask += 2 ** i;
  });
  w.uint(mask);
  controls.forEach((k, i) => {
    if (Math.floor(mask / 2 ** i) % 2) writeKnob(w, k, tune.melody.overrides[k]!);
  });
  const edits = new Map(tune.pitchEdits.map((e) => [e.noteIndex, e.midi]));
  const muted = new Set(tune.mutedIndices);
  w.uint(tune.noteSource.segments.length);
  let previous = 0;
  tune.noteSource.segments.forEach((s, i) => {
    const start = Math.round(s.start * 1000),
      duration = Math.max(1, Math.round(s.duration * 1000));
    const canonicalStart = start / 1000,
      canonicalEnd = (start + duration) / 1000;
    const precise =
      s.start !== canonicalStart ||
      s.duration !== canonicalEnd - canonicalStart ||
      s.source.end !== canonicalEnd;
    if (s.source.start !== s.start || Math.abs(s.source.end - (s.start + s.duration)) > 1e-9)
      throw new Error("Unsupported source coverage");
    w.byte(noteFlags(s.pitch, muted.has(i), edits.has(i), precise));
    w.uint(start - previous);
    previous = start;
    w.uint(duration);
    if (precise) {
      w.float(s.start);
      w.float(s.duration);
      w.float(s.source.end);
    }
    if (Number.isInteger(s.pitch)) w.byte(s.pitch);
    else w.float(s.pitch);
    if (edits.has(i)) w.byte(edits.get(i)!);
  });
  return w.finish();
}
function readOverrides(
  r: TuneReader,
  version: NoteSource["interpretationVersion"],
): Partial<Knobs> {
  const overrides: Partial<Knobs> = {},
    mask = r.uint();
  const controls = controlKeys(version);
  if (mask >= 2 ** controls.length) throw new Error("Unknown controls");
  controls.forEach((k, i) => {
    if (Math.floor(mask / 2 ** i) % 2) Object.assign(overrides, { [k]: readKnob(r, k) });
  });
  return overrides;
}
function readNotes(r: TuneReader) {
  const count = r.uint();
  if (count > TUNE_LIMITS.notes) throw new Error("Too many notes");
  const segments = [],
    pitchEdits = [],
    mutedIndices = [];
  let previous = 0;
  for (let i = 0; i < count; i++) {
    const flags = r.byte();
    if (flags > 15) throw new Error("Unknown note flags");
    previous += r.uint();
    const durationMs = r.uint();
    let start = previous / 1000,
      end = (previous + durationMs) / 1000,
      duration = end - start;
    if (flags & 8) {
      start = r.float();
      duration = r.float();
      end = r.float();
    }
    const pitch = flags & 1 ? r.float() : r.byte();
    segments.push({ start, duration, pitch, source: { start, end } });
    if (flags & 2) mutedIndices.push(i);
    if (flags & 4) pitchEdits.push({ noteIndex: i, midi: r.byte() });
  }
  return { segments, pitchEdits, mutedIndices };
}
export function unpackTune(
  bytes: Uint8Array,
  interpretationVersion: NoteSource["interpretationVersion"] = 1,
): PortableTune {
  const r = new TuneReader(bytes);
  const name = r.text(TUNE_LIMITS.nameBytes),
    durationMs = r.uint(),
    bpm = r.float(),
    beatsPerBar = r.uint();
  const preset = presets[r.byte()];
  if (!preset || !PRESETS[preset]) throw new Error("Unknown preset");
  const keyCode = r.byte();
  if (keyCode > 24) throw new Error("Unknown key");
  const sound = r.byte(),
    instrument = instruments[Math.floor(sound / 8)],
    octave = (sound % 8) - 3;
  if (!instrument || !INSTRUMENTS.some((i) => i.id === instrument))
    throw new Error("Unknown sound");
  const range = { minMidi: r.float(), maxMidi: r.float() };
  const overrides = readOverrides(r, interpretationVersion);
  const effectiveKnobs = resolveKnobs(preset, overrides);
  const { segments, pitchEdits, mutedIndices } = readNotes(r);
  r.end();
  return validatePortableTune({
    schemaVersion: 1,
    name,
    durationMs,
    bpm,
    beatsPerBar,
    melody: {
      preset,
      overrides,
      key:
        keyCode === 0
          ? "auto"
          : { tonic: (keyCode - 1) % 12, mode: keyCode > 12 ? "minor" : "major" },
    },
    effectiveKnobs,
    play: { instrument, octave },
    noteSource: {
      version: 1,
      interpretationVersion,
      range,
      segments,
      frozenDetection: Object.fromEntries(DETECTION_KNOBS.map((k) => [k, effectiveKnobs[k]])),
    },
    pitchEdits,
    mutedIndices,
  });
}
