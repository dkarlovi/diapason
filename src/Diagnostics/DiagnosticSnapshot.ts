import { sha256 } from "../Encoding/Sha256";
import { buildReportData, type ReportInput } from "./Diagnostics";
import { wavBytes, type WavChunk } from "../Encoding/Wav";

/** Legacy schema-4 report/WAV pairing retained for regression replay.
 * New recording packages hash PCM directly, without a JSON sidecar. */
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
