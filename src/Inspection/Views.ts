import type { Frame } from "../notes";
import type { ProcessingEvidence } from "../Recording/ProcessingEvidence.type";
import type {
  ExecutionIdentity,
  InputIdentity,
  InvestigationContext,
  ResolvedRecipe,
  StageProvenance,
  ViewName,
} from "./Inspection.type";
import { computeComparison } from "./Computation";
import type { PortableTune } from "../Tune/PortableTune.type";

export interface EvidenceView {
  name: ViewName;
  runKey: string | null;
  frames: Frame[];
  evidence: ProcessingEvidence;
  savedEvidence: ProcessingEvidence;
  tune: PortableTune;
  provenance: StageProvenance[];
  input: InputIdentity;
  execution: ExecutionIdentity;
}
export async function getView(
  context: InvestigationContext,
  name: ViewName,
  recipe?: ResolvedRecipe,
): Promise<EvidenceView> {
  if (recipe !== undefined) throw new Error("Recipes are not supported by evidence queries yet.");
  const saved = context.input.metadata;
  if (saved.schemaVersion !== 2)
    throw Object.assign(new Error("Saved melody unavailable for a capture-only WAV."), {
      code: "view.unavailable",
    });
  const base = {
    name,
    savedEvidence: saved.evidence,
    input: context.identity,
    execution: context.execution,
  };
  if (name === "saved")
    return structuredClone({
      ...base,
      runKey: `${context.identity.wavSha256}:saved`,
      frames: saved.frames,
      evidence: saved.evidence,
      tune: saved.tune,
      provenance: [
        {
          stage: "saved",
          key: context.identity.wavSha256,
          disposition: "saved",
          inputs: ["wavSha256"],
        },
      ],
    });
  const { result, provenance } = await computeComparison(context);
  const snapshot = name === "replay" ? result.edited : result.automatic;
  if (!snapshot) throw new Error("Current melody unavailable.");
  return {
    ...base,
    runKey: `${context.execution.runKey ?? "unidentified"}:${name}`,
    frames: snapshot.frames,
    evidence: snapshot.evidence,
    tune: snapshot.tune,
    provenance,
  };
}
