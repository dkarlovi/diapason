import { isNoteEdits } from "./note-edits";
import { isMelodySetting } from "./melody/settings";
import type { DiagnosticSnapshot } from "./diagnostic-snapshot";
import { analysisOptionsFor } from "./recording-profiles";
import type { AudioRecording as Recording } from "./Recording/Recording.type";

type JsonObject = Record<string, unknown>;
export const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function finiteJson(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  return !isObject(value) || Object.values(value).every(finiteJson);
}

function validatePair(pair: JsonObject) {
  if (
    typeof pair.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(pair.sha256) ||
    pair.format !== "pcm16-mono"
  ) {
    throw new Error("Invalid diagnostic audio identity.");
  }
  if (
    !Number.isInteger(pair.sampleCount) ||
    Number(pair.sampleCount) < 0 ||
    !Number.isInteger(pair.sampleRate) ||
    Number(pair.sampleRate) <= 0
  ) {
    throw new Error("Invalid diagnostic sample format.");
  }
}

function validateRecording(record: JsonObject, pair: JsonObject, configured: JsonObject) {
  if (
    typeof record.id !== "string" ||
    typeof record.name !== "string" ||
    (record.melody !== undefined && !isMelodySetting(record.melody)) ||
    !isObject(record.capture) ||
    !(Number(record.bpm) > 0)
  ) {
    throw new Error("Invalid diagnostic recording settings.");
  }
  if (record.noteEdits !== undefined && !isNoteEdits(record.noteEdits, Number(record.durationSec)))
    throw new Error("Invalid diagnostic note edits.");
  const source = record.source;
  if (
    source !== undefined &&
    (!isObject(source) ||
      !isObject(source.analysis) ||
      analysisOptionsFor({ source: source as NonNullable<Recording["source"]> }) !==
        source.analysis)
  )
    throw new Error("Invalid diagnostic analysis settings.");
  if (configured.sampleRate !== pair.sampleRate || record.sampleRate !== pair.sampleRate) {
    throw new Error("Invalid diagnostic sample rate.");
  }
}

/** Fail closed on incomplete schema-4 evidence; legacy reports are handled separately. */
export function validateDiagnostics(value: unknown): asserts value is DiagnosticSnapshot["report"] {
  if (!isObject(value) || !finiteJson(value)) throw new Error("Invalid diagnostic report.");
  const { audio, saved, build, config, settings, analysis, stages } = value;
  if (![audio, saved, build, config, settings, analysis, stages].every(isObject)) {
    throw new Error("Invalid diagnostic report: missing processing evidence.");
  }
  if (!isMelodySetting((settings as JsonObject).melody))
    throw new Error("Invalid diagnostic melody settings.");
  validatePair(audio as JsonObject);
  validateRecording(saved as JsonObject, audio as JsonObject, config as JsonObject);
  if (
    ![
      value.frames,
      value.notes,
      value.midiEvents,
      (stages as JsonObject).segments,
      (stages as JsonObject).editCoverage,
      (stages as JsonObject).decoded,
      (stages as JsonObject).items,
    ].every(Array.isArray)
  ) {
    throw new Error("Invalid diagnostic processing stages.");
  }
}

function arrayDifference(expected: unknown[], actual: unknown[], path: string): string | null {
  if (expected.length !== actual.length) return `${path}.length`;
  for (let index = 0; index < expected.length; index++) {
    const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`);
    if (difference) return difference;
  }
  return null;
}

function objectDifference(expected: JsonObject, actual: JsonObject, path: string): string | null {
  for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
    const difference = firstDifference(expected[key], actual[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

export const NUMERIC_COMPARISON_TOLERANCE = 1e-9;

/** Return a useful first differing field instead of an opaque snapshot failure. */
export function firstDifference(expected: unknown, actual: unknown, path: string): string | null {
  if (
    typeof expected === "number" &&
    typeof actual === "number" &&
    Math.abs(expected - actual) <= NUMERIC_COMPARISON_TOLERANCE
  )
    return null;
  if (expected === actual) return null;
  if (Array.isArray(expected) && Array.isArray(actual))
    return arrayDifference(expected, actual, path);
  if (isObject(expected) && isObject(actual)) return objectDifference(expected, actual, path);
  return path;
}

export interface ValueDifference {
  path: string;
  expected: unknown;
  actual: unknown;
  numericDelta: number | null;
}
export interface ValueComparison {
  firstDifference: string | null;
  maxNumericDelta: { path: string; absolute: number } | null;
  differences: ValueDifference[];
}
function compareNumber(a: number, b: number, path: string, result: ValueComparison): boolean {
  const absolute = Math.abs(a - b);
  if (
    Number.isFinite(absolute) &&
    (!result.maxNumericDelta || absolute > result.maxNumericDelta.absolute)
  )
    result.maxNumericDelta = { path, absolute };
  return absolute <= NUMERIC_COMPARISON_TOLERANCE;
}
function walkArray(a: unknown[], b: unknown[], path: string, result: ValueComparison): void {
  if (a.length !== b.length) walkComparison(a.length, b.length, `${path}.length`, result);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    walkComparison(a[i], b[i], `${path}[${i}]`, result);
}
function walkComparison(a: unknown, b: unknown, path: string, result: ValueComparison): void {
  if (typeof a === "number" && typeof b === "number") {
    if (compareNumber(a, b, path, result)) return;
  } else if (a === b) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    walkArray(a, b, path, result);
    return;
  }
  if (isObject(a) && isObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
      walkComparison(a[key], b[key], `${path}.${key}`, result);
    return;
  }
  result.firstDifference ??= path;
  result.differences.push({
    path,
    expected: a,
    actual: b,
    numericDelta: typeof a === "number" && typeof b === "number" ? Math.abs(a - b) : null,
  });
}
/** Collect meaningful differences while retaining the largest raw floating-point delta. */
export function compareValues(expected: unknown, actual: unknown, path: string): ValueComparison {
  const result: ValueComparison = { firstDifference: null, maxNumericDelta: null, differences: [] };
  walkComparison(expected, actual, path, result);
  return result;
}
