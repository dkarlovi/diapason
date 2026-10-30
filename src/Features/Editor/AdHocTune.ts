import type { NoteRecording } from "../../Recording/Recording.type";
import type { SavedVersion } from "../../Editing/Edit.storage";
import { createEditHistory, displayEditSnapshot } from "../../Editing/EditHistory";
import { validateEditCommit, validateEditHistory } from "../../Editing/EditHistory.validation";
import { applyEditSnapshot, captureEditSnapshot, sameEditSnapshot } from "../../Editing/EditState";
import { recordingFromPortableTune } from "../../Tune/PortableTune";
import type { EditHistory } from "../../Recording/RecordingEdit.type";
import type { PortableTune } from "../../Tune/PortableTune.type";

export interface AdHocTuneDraft {
  schemaVersion: 1;
  fragment: string;
  id: string;
  createdAt: number;
  name: string;
  history: EditHistory;
  versions: SavedVersion[];
}
export function createAdHocDraft(
  tune: PortableTune,
  fragment: string,
  id: string,
  now: number,
): AdHocTuneDraft {
  return {
    schemaVersion: 1,
    fragment,
    id,
    createdAt: now,
    name: tune.name,
    versions: [],
    history: createEditHistory({
      id: crypto.randomUUID(),
      label: "Initial state",
      createdAt: now,
      snapshot: captureEditSnapshot(recordingFromPortableTune(tune, id, now)),
    }),
  };
}
function validateDraftInfo(value: unknown, fragment: string): asserts value is AdHocTuneDraft {
  const draft = value as AdHocTuneDraft | null;
  if (
    !draft ||
    draft.schemaVersion !== 1 ||
    draft.fragment !== fragment ||
    typeof draft.id !== "string" ||
    !draft.id ||
    !Number.isFinite(draft.createdAt) ||
    typeof draft.name !== "string" ||
    !Array.isArray(draft.versions)
  )
    throw new Error("Invalid temporary tune draft.");
}
function validateDraftVersion(
  version: SavedVersion,
  draft: AdHocTuneDraft,
  duration: number,
): void {
  if (
    !version ||
    typeof version.id !== "string" ||
    !version.id ||
    version.recordingId !== draft.id ||
    typeof version.name !== "string" ||
    !version.name.trim() ||
    version.nameKey !== version.name.trim().toLowerCase() ||
    !Number.isFinite(version.createdAt)
  )
    throw new Error("Invalid temporary version.");
  validateEditCommit(version.commit, duration);
}
export function validateAdHocDraft(
  value: unknown,
  tune: PortableTune,
  fragment: string,
): AdHocTuneDraft {
  validateDraftInfo(value, fragment);
  const draft = value;
  const duration = tune.durationMs / 1000;
  validateEditHistory(draft.history, duration);
  const baseline = captureEditSnapshot(recordingFromPortableTune(tune, draft.id, draft.createdAt));
  if (!sameEditSnapshot(baseline, draft.history.commits[0]!.snapshot))
    throw new Error("Temporary draft does not match this tune.");
  for (const version of draft.versions) validateDraftVersion(version, draft, duration);
  if (
    new Set(draft.versions.map((v) => v.id)).size !== draft.versions.length ||
    new Set(draft.versions.map((v) => v.nameKey)).size !== draft.versions.length
  )
    throw new Error("Duplicate temporary versions.");
  return structuredClone(draft);
}
export function adHocRecording(tune: PortableTune, draft: AdHocTuneDraft): NoteRecording {
  return {
    ...applyEditSnapshot(
      recordingFromPortableTune(tune, draft.id, draft.createdAt),
      displayEditSnapshot(draft.history),
    ),
    name: draft.name,
  } as NoteRecording;
}
export function isAdHocDirty(tune: PortableTune, draft: AdHocTuneDraft): boolean {
  return (
    draft.name !== tune.name ||
    draft.versions.length > 0 ||
    !sameEditSnapshot(displayEditSnapshot(draft.history), draft.history.commits[0]!.snapshot)
  );
}
