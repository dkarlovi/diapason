import type { DiagnosticSnapshot } from "./diagnostic-snapshot";
import { sha256 } from "./sha256";
import { buildReportData, SCHEMA_VERSION } from "./diagnostics";
import { makeReportInput } from "./editor-model";
import { analyzeRecording } from "./recording-analysis";
import { qualityStats } from "./recorder";
import { notesToMidi } from "./midi";
import { decodeWav } from "./wav-reader";
import { isObject, validateDiagnostics, firstDifference } from "./diagnostics-validation";
import { BUILD_INFO } from "./build-info";

function compareBuild(build: DiagnosticSnapshot["report"]["build"]) {
  if (build.revision === "unknown" || BUILD_INFO.revision === "unknown") return "unknown";
  return JSON.stringify(build) === JSON.stringify(BUILD_INFO) ? "same" : "different";
}

function compareStages(
  expected: DiagnosticSnapshot["report"],
  actual: ReturnType<typeof buildReportData>,
) {
  const fields = [
    "settings",
    "analysis",
    "frames",
    "notes",
    "stages",
    "midiEvents",
    "quality",
    "config",
  ] as const;
  return (
    fields.map((field) => firstDifference(expected[field], actual[field], field)).find(Boolean) ??
    (expected.build.pipeline !== BUILD_INFO.pipeline ? "build.pipeline" : null)
  );
}

export async function replayDiagnostics(value: unknown, wavBytes: ArrayBuffer) {
  if (!isObject(value)) throw new Error("Invalid diagnostic report.");
  if (value.schemaVersion === undefined && value.app === "diapason") {
    return {
      status: "incomplete",
      difference: "Legacy JSON omits settings needed for exact replay.",
    } as const;
  }
  if ((value.schemaVersion === 2 || value.schemaVersion === 3) && value.app === "diapason")
    return {
      status: "incomplete",
      difference: `Schema-${value.schemaVersion} evidence was produced by an older analysis pipeline.`,
    } as const;
  if (value.schemaVersion !== SCHEMA_VERSION) throw new Error("Unsupported diagnostic schema.");
  validateDiagnostics(value);
  if ((await sha256(wavBytes)) !== value.audio.sha256)
    throw new Error("WAV does not match diagnostic SHA-256.");
  const { pcm, sampleRate } = decodeWav(wavBytes);
  if (pcm.length !== value.audio.sampleCount || sampleRate !== value.audio.sampleRate)
    throw new Error("WAV sample count/rate does not match diagnostics.");
  const record = { ...value.saved, audio: new Blob() };
  const frames = analyzeRecording(pcm, sampleRate, record);
  const actual = buildReportData(makeReportInput(record, frames, qualityStats(frames, pcm)));
  const difference = compareStages(value, actual);
  const build = compareBuild(value.build);
  return {
    status: difference ? "mismatch" : "match",
    difference,
    build,
    notes: actual.notes,
    midi: notesToMidi(actual.notes, { bpm: record.bpm }),
  } as const;
}
