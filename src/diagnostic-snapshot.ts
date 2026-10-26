import { buildReportData, type ReportInput } from "./diagnostics";
import { wavBytes, type WavChunk } from "./wav";

export async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Capture all state and WAV bytes before yielding to asynchronous hashing.
 *  Pass the Download WAV's metadata chunks so the hash matches that file. */
export async function diagnosticSnapshot(
  input: ReportInput,
  pcm: Float32Array,
  extra: readonly WavChunk[] = [],
) {
  const report = JSON.parse(JSON.stringify(buildReportData(input))) as ReturnType<
    typeof buildReportData
  >;
  const bytes = wavBytes(pcm, input.sampleRate, extra);
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
