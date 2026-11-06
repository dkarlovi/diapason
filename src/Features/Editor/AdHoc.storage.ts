import type { AdHocTuneDraft } from "./AdHocTune";
import { publishStoredChange, subscribeStoredChanges } from "../../Storage/StoredChanges";
const key = (fragment: string) => `diapason:tune-draft:1:${fragment}`;
export function readAdHocDraft(storage: Storage, fragment: string): unknown {
  const value = storage.getItem(key(fragment));
  return value === null ? null : JSON.parse(value);
}
export function writeAdHocDraft(storage: Storage, draft: AdHocTuneDraft): void {
  storage.setItem(key(draft.fragment), JSON.stringify(draft));
}
export function clearAdHocDraft(storage: Storage, fragment: string): void {
  storage.removeItem(key(fragment));
}
export function announceAdHocDraft(draft: AdHocTuneDraft, savedAt: number, source: string): void {
  publishStoredChange({ kind: "tune-draft", fragment: draft.fragment, draft, savedAt, source });
}
/** Calls back with unvalidated drafts other instances of the tune announced. */
export function subscribeAdHocDrafts(
  fragment: string,
  listener: (draft: unknown, savedAt: number, source: string) => void,
): () => void {
  return subscribeStoredChanges((change) => {
    if (change.kind === "tune-draft" && change.fragment === fragment)
      listener(change.draft, change.savedAt, change.source);
  });
}
