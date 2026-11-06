import type { StoredChange } from "./StoredChange.type";
import { hasProperties } from "../Encoding/Properties";

const CHANNEL = "diapason:stored-changes";
let sender: BroadcastChannel | null = null;

function isStoredChange(value: unknown): value is StoredChange {
  if (!hasProperties(value, "kind")) return false;
  const change = value;
  if (change.kind === "recording")
    return hasProperties(change, "id") && typeof change.id === "string";
  return (
    change.kind === "tune-draft" &&
    hasProperties(change, "fragment", "source", "savedAt") &&
    typeof change.fragment === "string" &&
    typeof change.source === "string" &&
    Number.isFinite(change.savedAt)
  );
}
export function publishStoredChange(change: StoredChange): void {
  if (typeof BroadcastChannel === "undefined") return;
  sender ??= new BroadcastChannel(CHANNEL);
  sender.postMessage(change);
}
/** Delivers changes from other tabs, frames, and this document alike. */
export function subscribeStoredChanges(listener: (change: StoredChange) => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (isStoredChange(event.data)) listener(event.data);
  };
  return () => channel.close();
}
