import { matchSourceItems, type SourceMatch } from "../Recording/RecordingPackageComparison";
import { firstDifference } from "../Diagnostics/Diagnostics.validation";
import type { EvidenceView } from "./Views";
import {
  pagedReport,
  selectorRange,
  overlaps,
  selectorArgv,
  type SourceSelector,
  type PageOptions,
} from "./Query";
function stageValues(view: EvidenceView, index: number) {
  const stages = view.evidence.stages;
  const item = stages.items[index]!;
  return {
    segmentation: item.source,
    representativePitch: stages.segments[index]?.pitch ?? null,
    tuning: stages.tuning,
    nearest: stages.faithful[index] ?? null,
    decoded: stages.decoded[index] ?? null,
    timing: item.automatic,
    final: item.note,
    mute: item.muted,
  };
}
function firstStage(saved: EvidenceView, candidate: EvidenceView, match: SourceMatch) {
  if (match.kind !== "matched" || match.savedIndex === null) return "segmentation";
  const a = stageValues(saved, match.savedIndex);
  const b = stageValues(candidate, match.currentIndices[0]!);
  for (const stage of Object.keys(a) as (keyof typeof a)[])
    if (firstDifference(a[stage], b[stage], stage)) return stage;
  return null;
}
export function queryStages(
  saved: EvidenceView,
  candidate: EvidenceView,
  query: SourceSelector & PageOptions,
) {
  const range = selectorRange(candidate, query);
  const a = saved.evidence.stages.items;
  const b = candidate.evidence.stages.items;
  const rows = matchSourceItems(a, b)
    .filter((match) => {
      if (!range) return true;
      const item = match.savedIndex === null ? undefined : a[match.savedIndex];
      return item
        ? overlaps(item.source, range)
        : match.currentIndices.some((i) => overlaps(b[i]!.source, range));
    })
    .map((match) => ({
      ...match,
      saved:
        match.savedIndex === null
          ? null
          : { id: a[match.savedIndex]!.id, ...stageValues(saved, match.savedIndex) },
      current: match.currentIndices.map((i) => ({ id: b[i]!.id, ...stageValues(candidate, i) })),
      firstDifferingStage: firstStage(saved, candidate, match),
    }));
  return pagedReport(candidate, "stages", rows, query, selectorArgv(query));
}
