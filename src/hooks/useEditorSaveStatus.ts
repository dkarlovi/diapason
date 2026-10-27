import { useSyncExternalStore } from "react";
import { getEditorSaveStatuses, subscribeEditorSaves } from "../editor-save-queue";
export function useEditorSaveStatus() {
  return useSyncExternalStore(subscribeEditorSaves, getEditorSaveStatuses, getEditorSaveStatuses);
}
