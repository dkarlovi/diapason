import { useSyncExternalStore } from "react";
import type { Recording } from "../Recording/Recording.type";
import { analysisKey } from "../analysis-cache";
import { getAnalysisState, subscribeAnalysis } from "../analysis-jobs";

export function useAnalysisStatus(record: Recording | null) {
  const key = record && !record.noteSource ? analysisKey(record) : "";
  const id = record?.id ?? "";
  return useSyncExternalStore(subscribeAnalysis, () => getAnalysisState(key, id));
}
