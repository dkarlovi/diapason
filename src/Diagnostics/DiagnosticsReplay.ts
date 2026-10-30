import type { DiagnosticSnapshot } from "./DiagnosticSnapshot";
import { sha256 } from "../Encoding/Sha256";
import { buildReportData, SCHEMA_VERSION } from "./Diagnostics";
import { makeReportInput } from "../Editing/Editor.model";
import { analyzeRecording } from "../Analysis/RecordingAnalysis";
import { qualityStats } from "../Audio/Recorder";
import { notesToMidi } from "../Midi/Midi";
import { decodeWav } from "../Encoding/WavReader";
import { isObject, validateDiagnostics, firstDifference } from "./Diagnostics.validation";
import { BUILD_INFO } from "./BuildInfo";
import { withControlDefaults } from "../Melody/Knobs";

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
  const normalized = {
    ...expected,
    stages: { ...expected.stages, knobs: withControlDefaults(expected.stages.knobs) },
  };
  return (
    fields.map((field) => firstDifference(normalized[field], actual[field], field)).find(Boolean) ??
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
