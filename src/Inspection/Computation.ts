import { isObject } from "../Diagnostics/Diagnostics.validation";
import { analyzeRecording, resolveAnalysisOptions } from "../Analysis/RecordingAnalysis";
import { restoreRecordingPackage } from "../Recording/RecordingPackage";
import { compareRecordingPackage } from "../Recording/RecordingPackageComparison";
import { cachedSnapshot } from "./SnapshotCache";
import { packFrames, unpackFrames } from "../Analysis/Frame.storage";
import type { InvestigationContext, StageProvenance } from "./Inspection.type";

function validPackedNumber(n: unknown, index: number): boolean {
  if (index % 4 === 1 && n === null) return true;
  if (typeof n !== "number" || !Number.isFinite(n)) return false;
  return index % 4 === 1 ? n > 0 : n >= 0;
}
function storedFrames(value: unknown): Float64Array | undefined {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.packed)) return;
  const numbers = value.packed;
  if (numbers.length % 4 || !numbers.every(validPackedNumber)) return;
  for (let i = 0; i < numbers.length; i += 4) {
    if (i >= 4 && numbers[i] < numbers[i - 4]) return;
  }
  return Float64Array.from(numbers, (n) => (n === null ? NaN : n));
}
/** Full-context acoustics may be reused; saved observations are always compared anew. */
export async function computeComparison(context: InvestigationContext) {
  const provenance: StageProvenance[] = [];
  if (context.input.metadata.schemaVersion !== 2)
    return { result: await compareRecordingPackage(context.input), provenance };
  const record = await restoreRecordingPackage(context.input, "", "restore");
  const dependencies = {
    pcmSha256: context.identity.pcmSha256,
    sampleRate: context.input.sampleRate,
    detector: resolveAnalysisOptions(record),
  };
  const key =
    context.execution.codeRuntimeKey && context.identity.pcmSha256
      ? context.stageKey?.("frames", dependencies)
      : null;
  let packed = key ? storedFrames(await context.stages.read(key)) : undefined;
  const disposition = packed ? "reused" : "recomputed";
  if (!packed) {
    packed = packFrames(analyzeRecording(context.input.pcm, context.input.sampleRate, record));
    if (key)
      await context.stages.write(key, {
        schemaVersion: 1,
        packed: Array.from(packed, (n) => (Number.isNaN(n) ? null : n)),
      });
  }
  provenance.push({
    stage: "frames",
    key: key ?? "unavailable",
    disposition,
    inputs: ["audio.sha256", "sampleRate", "analysis"],
  });
  const frames = unpackFrames(packed);
  return {
    result: await compareRecordingPackage(context.input, frames, (record, view) =>
      cachedSnapshot(context, record, frames, key, provenance, view),
    ),
    provenance,
  };
}
