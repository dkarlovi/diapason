import type { AdHocTuneDraft } from "./AdHocTune";
const key = (fragment: string) => `diapason:tune-draft:1:${fragment}`;
export function readAdHocDraft(storage: Storage, fragment: string): unknown | null {
  const value = storage.getItem(key(fragment));
  return value === null ? null : JSON.parse(value);
}
export function writeAdHocDraft(storage: Storage, draft: AdHocTuneDraft): void {
  storage.setItem(key(draft.fragment), JSON.stringify(draft));
}
export function clearAdHocDraft(storage: Storage, fragment: string): void {
  storage.removeItem(key(fragment));
}
