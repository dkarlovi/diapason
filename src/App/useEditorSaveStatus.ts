import { useSyncExternalStore } from "react";
import { getEditorSaveStatuses, subscribeEditorSaves } from "../Editing/EditorSaveQueue";
export function useEditorSaveStatus() {
  return useSyncExternalStore(subscribeEditorSaves, getEditorSaveStatuses, getEditorSaveStatuses);
}
