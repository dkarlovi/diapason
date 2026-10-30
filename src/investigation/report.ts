import { keyName } from "../melody/key";
import type { ReadRecordingPackage } from "../recording-package-types";
import type { InputIdentity, Report, OverallResult } from "./types";
export function makeReport<T>(
  kind: string,
  input: InputIdentity | null,
  data: T,
  overall: OverallResult = "pass",
): Report<T> {
  return {
    schemaVersion: 1,
    kind,
    input,
    view: "saved",
    execution: null,
    scope: { total: 0, returned: 0, offset: 0, limit: 20, omitted: 0 },
    overall,
    findings: [],
    data,
    nextSteps: [],
  };
}
export interface PackageSummary {
  name: string;
  durationSeconds: number;
  sampleRate: number;
  bpm: number;
  beatsPerBar: number;
  schema: number;
  noteCount: number | null;
  frameCount: number | null;
  pitchCorrections: number | null;
  muteCount: number | null;
  key: string | null;
  tuningCents: number | null;
  playback: string | null;
  voicedPercent: number | null;
  medianClarity: number | null;
  clipped: boolean | null;
}
export function summarizePackage(
  input: ReadRecordingPackage,
  identity: InputIdentity,
): Report<PackageSummary> {
  const p = input.metadata;
  const saved = p.schemaVersion === 2 ? p : null;
  const key = saved?.evidence.stages.key.chosen;
  const report = makeReport(
    "inspect",
    identity,
    {
      name: p.recording.name,
      durationSeconds: input.pcm.length / input.sampleRate,
      sampleRate: input.sampleRate,
      bpm: p.recording.bpm,
      beatsPerBar: p.recording.beatsPerBar,
      schema: p.schemaVersion,
      noteCount: saved?.evidence.notes.length ?? null,
      frameCount: saved?.frames.length ?? null,
      pitchCorrections:
        saved?.evidence.stages.items.filter((i) => i.editState.axes.includes("pitch")).length ??
        null,
      muteCount: saved?.evidence.stages.items.filter((i) => i.muted).length ?? null,
      key: key ? keyName(key) : null,
      tuningCents: saved ? saved.evidence.stages.tuning * 100 : null,
      playback: saved ? `${saved.tune.play.instrument}, octave ${saved.tune.play.octave}` : null,
      voicedPercent: saved ? saved.evidence.quality.voicedRatio * 100 : null,
      medianClarity: saved?.evidence.quality.medianClarity ?? null,
      clipped: saved?.evidence.quality.clipped ?? null,
    },
    "incomplete",
  );
  report.findings.push({
    code: saved ? "verification.pending" : "package.capture-only",
    severity: "info",
    message: saved
      ? "Saved evidence inspected; current replay verification has not run."
      : "Capture-only WAV: saved melody comparison unavailable.",
    evidence: ["schemaVersion"],
  });
  report.nextSteps.push({
    code: "inspect.raw",
    reason: "Read the complete original package when needed",
    argv: ["bin/diapason", "inspect", identity.path, "--raw", "--format", "json"],
  });
  return report;
}
export function exitCode(report: Report<unknown>): 0 | 1 | 2 {
  return report.overall === "fail" ? 2 : report.overall === "mismatch" ? 1 : 0;
}
