import { buildReportData, type ReportInput } from "./diagnostics";
import { wavBytes } from "./wav";

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Capture all state and WAV bytes before yielding to asynchronous hashing. */
export async function diagnosticSnapshot(input: ReportInput, pcm: Float32Array) {
  const report = JSON.parse(JSON.stringify(buildReportData(input))) as ReturnType<
    typeof buildReportData
  >;
  const bytes = wavBytes(pcm, input.sampleRate);
  const identity = {
    recordingId: input.recording.id,
    snapshotId: crypto.randomUUID(),
    sampleCount: pcm.length,
    sampleRate: input.sampleRate,
    format: "pcm16-mono",
    timelineOrigin: "recording-downbeat",
  };
  return {
    report: { ...report, audio: { ...identity, sha256: await sha256(bytes) } },
    wav: new Blob([bytes], { type: "audio/wav" }),
  };
}
export type DiagnosticSnapshot = Awaited<ReturnType<typeof diagnosticSnapshot>>;
