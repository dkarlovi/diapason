import { PackageError, packageError, atPackagePath, requirePackage } from "./package-error";
import { readTuneMidiPayload } from "./tune-midi-reader";
import { validateNoteSource } from "./note-source";
import { sameMelodySetting } from "./melody/settings";
import { KNOB_DEFS, isKnobs, withControlDefaults, historicalControls } from "./melody/knobs";
import { firstDifference } from "./diagnostics-validation";
import { pitchEditFor, summarizePitchEdits } from "./note-edits";
import { covers } from "./recording";
import { midiToName } from "./notes";
import { validateEditSnapshot } from "./edit-snapshot-validation";
import { validatePortableTune } from "./portable-tune";
import { validMetadata, type WavMetadata } from "./wav-metadata";
import type { ProcessingEvidence, RecordingPackageV2 } from "./recording-package-types";
import { finiteJson, isObject } from "./diagnostics-validation";
import type { Frame, NoteEvent } from "./notes";
import type { NoteItem } from "./recording";

// Bound work before parsing untrusted JSON, independently of share-link limits.
export const MAX_PACKAGE_METADATA_BYTES = 128 * 1024 * 1024;
const damaged = () => new PackageError("malformed", "$", "package.relationship");
function requireFields(...checks: boolean[]): void {
  if (!checks.every(Boolean)) throw damaged();
}
function validateIdentity(p: RecordingPackageV2, samples: number, rate: number) {
  requireFields(
    p.app === "diapason",
    p.schemaVersion === 2,
    p.kind === "recording",
    validMetadata(p as unknown as WavMetadata, samples),
    p.recording.downbeatSample === 0,
    typeof p.recording.sourceId === "string",
    p.recording.sourceId.length > 0,
    Number.isFinite(p.exported.at),
    validMetadata({ ...p, provenance: p.exported.context } as unknown as WavMetadata, samples),
    p.audio.format === "pcm16-mono",
    p.audio.timelineOrigin === "recording-downbeat",
    p.audio.sampleCount === samples,
    p.audio.sampleRate === rate,
    /^[a-f0-9]{64}$/.test(p.audio.sha256),
  );
}
function validateMidi(bytes: number[]) {
  requireFields(
    Array.isArray(bytes),
    bytes.length >= 22,
    bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255),
    bytes.slice(0, 4).join(",") === "77,84,104,100",
  );
  readTuneMidiPayload(Uint8Array.from(bytes));
}
function validFrame(f: Frame, previous: number, duration: number): boolean {
  return [
    Number.isFinite(f.t),
    f.t >= 0,
    f.t <= duration,
    f.t > previous,
    f.freq === null || (Number.isFinite(f.freq) && f.freq > 0),
    Number.isFinite(f.clarity),
    f.clarity >= 0,
    f.clarity <= 1,
    Number.isFinite(f.rms),
    f.rms >= 0,
  ].every(Boolean);
}
function validateFrames(p: RecordingPackageV2, samples: number, duration: number) {
  const maxFrames = Math.ceil(samples / p.recording.source.analysis.hop) + 2;
  requireFields(Array.isArray(p.frames), p.frames.length <= maxFrames);
  let previous = -1;
  for (const frame of p.frames) {
    requireFields(validFrame(frame, previous, duration));
    previous = frame.t;
  }
}
function validNote(n: NoteEvent): boolean {
  return [
    Number.isInteger(n.midi),
    n.midi >= 0,
    n.midi <= 127,
    Number.isFinite(n.start),
    Number.isFinite(n.duration),
    n.start >= 0,
    n.duration > 0,
    n.name === midiToName(n.midi),
  ].every(Boolean);
}
function validateItem(item: NoteItem, duration: number) {
  requireFields(
    Number.isFinite(item.source.start),
    Number.isFinite(item.source.end),
    item.source.start >= 0,
    item.source.end > item.source.start,
    item.source.end <= duration,
    typeof item.muted === "boolean",
    [item.note, item.automatic, item.raw].every(validNote),
    Array.isArray(item.editState.ids),
    Array.isArray(item.editState.axes),
    Array.isArray(item.editState.differingAxes),
  );
}
function validateEvidence(e: ProcessingEvidence, samples: number, rate: number) {
  const duration = samples / rate;
  requireFields(
    [e.settings, e.analysis, e.stages, e.config, e.quality].every(isObject),
    Array.isArray(e.notes),
    Array.isArray(e.stages.items),
    Array.isArray(e.stages.segments),
    Array.isArray(e.stages.editCoverage),
    Array.isArray(e.stages.harmony),
    isObject(e.stages.key),
    e.config.sampleRate === rate,
    Math.abs(e.config.durationSec - duration) <= 1e-9,
    e.stages.items.length <= samples,
    e.stages.segments.length <= samples,
  );
  for (const item of e.stages.items) validateItem(item, duration);
  requireFields(
    JSON.stringify(e.notes) ===
      JSON.stringify(e.stages.items.filter((i) => !i.muted).map((i) => i.note)),
  );
}
function samePlay(
  a: { instrument: string; octave: number },
  b: { instrument: string; octave: number },
) {
  return a.instrument === b.instrument && a.octave === b.octave;
}
function requireSame(expected: unknown, actual: unknown, path: string): boolean {
  const difference = firstDifference(expected, actual, path);
  requirePackage(difference === null, difference ?? path, "package.relationship");
  return true;
}
function validateRelationships(p: RecordingPackageV2, duration: number) {
  const e = p.evidence;
  const a = p.recording.source.analysis;
  const context = { ...p.tune.noteSource, segments: e.stages.segments };
  validateNoteSource(context, duration, true);
  const evidenceKnobs = withControlDefaults(e.stages.knobs);
  const tuneKnobs = withControlDefaults(p.tune.effectiveKnobs);
  requireFields(
    e.stages.items.length === e.stages.segments.length,
    e.stages.items.length === p.tune.noteSource.segments.length,
    [e.stages.faithful, e.stages.decoded, e.stages.notes].every(
      (notes) => Array.isArray(notes) && notes.every(validNote),
    ),
    isKnobs(e.stages.knobs),
    KNOB_DEFS.every((d) => d.key in evidenceKnobs),
    requireSame(tuneKnobs, evidenceKnobs, "evidence.stages.knobs"),
    e.config.rmsGate === p.tune.effectiveKnobs.levelGate,
    e.config.windowSize === a.windowSize,
    e.config.hop === a.hop,
    e.config.minFreq === a.minFreq,
    e.config.maxFreq === a.maxFreq,
    e.config.clarityThreshold === a.clarityThreshold,
  );
  const analysis = e.analysis as unknown as Record<string, unknown>;
  requireFields(
    Object.entries({ ...a, masking: "none" }).every(
      ([key, value]) => firstDifference(value, analysis[key], key) === null,
    ),
  );
  requireFields(
    firstDifference(
      summarizePitchEdits(
        p.intent.intent.noteEdits,
        e.stages.items.map((item) => item.source),
      ),
      e.stages.editCoverage.map(({ id, status, missing }) => ({ id, status, missing })),
      "coverage",
    ) === null,
  );
  requireFields(
    firstDifference(
      e.stages.items.flatMap((item, noteIndex) =>
        item.editState.axes.length ? [{ noteIndex, midi: item.note.midi }] : [],
      ),
      p.tune.pitchEdits,
      "pitchEdits",
    ) === null,
  );
  requireFields(
    firstDifference(
      e.stages.items.flatMap((item, i) => (item.muted ? [i] : [])),
      p.tune.mutedIndices,
      "mutes",
    ) === null,
  );
  for (const [index, item] of e.stages.items.entries()) {
    requireFields(
      firstDifference(item.source, e.stages.segments[index]!.source, "source") === null,
    );
    const edit = pitchEditFor(p.intent.intent.noteEdits, item.source);
    requireFields(
      firstDifference(edit ? [edit.id] : [], item.editState.ids, "editIds") === null,
      firstDifference(edit ? ["pitch"] : [], item.editState.axes, "editAxes") === null,
      item.note.start === item.automatic.start,
      item.note.duration === item.automatic.duration,
    );
    requireFields(
      item.note.midi === (edit?.midi ?? item.automatic.midi),
      item.muted === (p.intent.intent.muted ?? []).some((m) => covers(m, item.raw)),
    );
  }
}
function validateTuneContext(p: RecordingPackageV2, duration: number) {
  validateEditSnapshot(p.intent, duration);
  validatePortableTune(p.tune, { historical: true });
  requireFields(
    p.tune.name === p.recording.name,
    p.tune.bpm === p.recording.bpm,
    p.tune.beatsPerBar === p.recording.beatsPerBar,
    p.tune.durationMs === Math.ceil(duration * 1000),
    sameMelodySetting(p.evidence.settings.melody, p.tune.melody),
    samePlay(p.evidence.settings.play, p.tune.play),
    p.intent.intent.melody !== undefined,
    p.intent.intent.play !== undefined,
    sameMelodySetting(p.intent.intent.melody!, p.tune.melody),
    samePlay(p.intent.intent.play!, p.tune.play),
    KNOB_DEFS.every((d) => d.key in withControlDefaults(p.tune.effectiveKnobs)),
    p.evidence.settings.bpm === p.recording.bpm,
    p.evidence.settings.beatsPerBar === p.recording.beatsPerBar,
  );
}
function requiredObject(value: unknown, path: string): asserts value is Record<string, unknown> {
  requirePackage(isObject(value), path, "package.structure");
}
function validateStructure(value: unknown): asserts value is RecordingPackageV2 {
  requiredObject(value, "package");
  for (const key of ["recording", "provenance", "exported", "audio", "intent", "tune", "evidence"])
    requiredObject(value[key], key);
  const p = value as unknown as RecordingPackageV2;
  for (const [path, field] of [
    ["tune.noteSource", p.tune.noteSource],
    ["tune.effectiveKnobs", p.tune.effectiveKnobs],
    ["evidence.stages", p.evidence.stages],
    ["evidence.settings", p.evidence.settings],
  ])
    requiredObject(field, String(path));
  requiredObject(p.evidence.stages.knobs, "evidence.stages.knobs");
  for (const key of [
    "items",
    "segments",
    "editCoverage",
    "harmony",
    "faithful",
    "decoded",
    "notes",
  ] as const) {
    requirePackage(
      Array.isArray(p.evidence.stages[key]),
      `evidence.stages.${key}`,
      "package.stage-array",
    );
  }
  requirePackage(Array.isArray(p.frames), "frames", "package.frames");
  requirePackage(Array.isArray(p.evidence.notes), "evidence.notes", "package.notes");
  requiredObject(p.recording.source, "recording.source");
  requiredObject(p.recording.source.analysis, "recording.source.analysis");
  requiredObject(p.recording.capture, "recording.capture");
  requiredObject(p.exported.context, "exported.context");
  requiredObject(p.provenance.build, "provenance.build");

  const version = p.tune.noteSource.interpretationVersion;
  if (version !== 1 && version !== 2)
    throw new PackageError(
      "unsupported",
      "tune.noteSource.interpretationVersion",
      "interpretation.supported",
    );
  historicalControls(p.evidence.stages.knobs, version, "evidence.stages.knobs");
  historicalControls(p.tune.effectiveKnobs, version, "tune.effectiveKnobs");
}
export function validateRecordingPackage(
  value: unknown,
  sampleCount: number,
  sampleRate: number,
): RecordingPackageV2 {
  try {
    validateStructure(value);
    const p = value;
    requirePackage(finiteJson(p), "package", "package.finite-numbers");
    atPackagePath("recording", () => validateIdentity(p, sampleCount, sampleRate));
    atPackagePath("midiBytes", () => validateMidi(p.midiBytes));
    atPackagePath("tune", () => validateTuneContext(p, sampleCount / sampleRate));
    atPackagePath("frames", () => validateFrames(p, sampleCount, sampleCount / sampleRate));
    atPackagePath("evidence", () => validateEvidence(p.evidence, sampleCount, sampleRate));
    atPackagePath("evidence.stages", () => validateRelationships(p, sampleCount / sampleRate));
    atPackagePath("evidence.quality", () => validateMusicalEvidence(p, sampleCount / sampleRate));
    return p;
  } catch (error) {
    const result = packageError(error, "package");
    if (isObject(value)) {
      const p = value as unknown as Partial<RecordingPackageV2>;
      result.context = {
        ...(typeof p.schemaVersion === "number" ? { schemaVersion: p.schemaVersion } : {}),
        ...(typeof p.tune?.noteSource?.interpretationVersion === "number"
          ? { interpretationVersion: p.tune.noteSource.interpretationVersion }
          : {}),
        ...(p.exported?.context?.build ? { build: p.exported.context.build } : {}),
      };
    }
    throw result;
  }
}

function validateMusicalEvidence(p: RecordingPackageV2, duration: number) {
  const { key, harmony, editCoverage, tuning } = p.evidence.stages;
  requireFields(typeof key.auto === "boolean", Array.isArray(key.ranked), Number.isFinite(tuning));
  if (key.chosen !== null) requireFields(validKey(key.chosen));
  for (const rank of key.ranked) requireFields(validKey(rank.key), Number.isFinite(rank.score));
  for (const chord of harmony)
    requireFields(
      Number.isFinite(chord.start),
      Number.isFinite(chord.end),
      chord.start >= 0,
      chord.end > chord.start,
      validPitchClass(chord.root),
      ["maj", "min", "dim"].includes(chord.quality),
      Array.isArray(chord.pitchClasses),
      chord.pitchClasses.every(validPitchClass),
    );
  for (const coverage of editCoverage) {
    requireFields(
      typeof coverage.id === "string",
      ["active", "partial", "inactive"].includes(coverage.status),
      Array.isArray(coverage.missing),
    );
    for (const range of coverage.missing)
      requireFields(range.start >= 0, range.end > range.start, range.end <= duration);
  }
  const q = p.evidence.quality;
  requireFields(
    Number.isFinite(q.voicedRatio),
    q.voicedRatio >= 0,
    q.voicedRatio <= 1,
    Number.isFinite(q.medianClarity),
    Number.isFinite(q.centsStd),
    q.centsStd >= 0,
    Number.isFinite(q.peak),
    q.peak >= 0,
    typeof q.clipped === "boolean",
  );
}
function validPitchClass(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 12;
}
function validKey(key: { tonic: number; mode: string }): boolean {
  return validPitchClass(key.tonic) && ["major", "minor"].includes(key.mode);
}
