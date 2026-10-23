import type { DiagnosticSnapshot } from "./diagnostic-snapshot";

type JsonObject = Record<string, unknown>;
export const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function finiteJson(value: unknown): boolean {
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
    !isObject(record.tuning) ||
    !isObject(record.capture) ||
    !(Number(record.bpm) > 0)
  ) {
    throw new Error("Invalid diagnostic recording settings.");
  }
  if (configured.sampleRate !== pair.sampleRate || record.sampleRate !== pair.sampleRate) {
    throw new Error("Invalid diagnostic sample rate.");
  }
}

/** Fail closed on incomplete schema-2 evidence; legacy reports are handled separately. */
export function validateDiagnostics(value: unknown): asserts value is DiagnosticSnapshot["report"] {
  if (!isObject(value) || !finiteJson(value)) throw new Error("Invalid diagnostic report.");
  const { audio, saved, build, config, settings, analysis, stages } = value;
  if (![audio, saved, build, config, settings, analysis, stages].every(isObject)) {
    throw new Error("Invalid diagnostic report: missing processing evidence.");
  }
  validatePair(audio as JsonObject);
  validateRecording(saved as JsonObject, audio as JsonObject, config as JsonObject);
  if (
    ![
      value.frames,
      value.notes,
      value.midiEvents,
      (stages as JsonObject).segmented,
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

/** Return a useful first differing field instead of an opaque snapshot failure. */
export function firstDifference(expected: unknown, actual: unknown, path: string): string | null {
  if (
    typeof expected === "number" &&
    typeof actual === "number" &&
    Math.abs(expected - actual) <= 1e-9
  )
    return null;
  if (expected === actual) return null;
  if (Array.isArray(expected) && Array.isArray(actual))
    return arrayDifference(expected, actual, path);
  if (isObject(expected) && isObject(actual)) return objectDifference(expected, actual, path);
  return path;
}
