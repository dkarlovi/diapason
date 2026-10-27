import { Undo2, Redo2 } from "lucide-react";
import { Button } from "./primitives";
import { EditorVersions } from "./EditorVersions";
import type { EditorState } from "./editor-view-types";
type HistoryState = Pick<
  EditorState,
  | "canUndo"
  | "canRedo"
  | "undoLabel"
  | "redoLabel"
  | "undo"
  | "redo"
  | "editingDisabled"
  | "record"
  | "versions"
  | "previewId"
  | "stopPlayback"
>;
const actionName = (verb: string, label: string | null) =>
  label ? `${verb} ${label.charAt(0).toLowerCase()}${label.slice(1)}` : verb;
export function EditorHistoryActions({ state }: { state: HistoryState }) {
  return (
    <div className="editor-history-actions" role="group" aria-label="Editing history">
      <Button
        disabled={!state.canUndo || state.editingDisabled}
        onClick={state.undo}
        aria-label={actionName("Undo", state.undoLabel)}
        title={actionName("Undo", state.undoLabel)}
      >
        <Undo2 aria-hidden="true" />
        <span>Undo</span>
      </Button>
      <Button
        disabled={!state.canRedo || state.editingDisabled}
        onClick={state.redo}
        aria-label={actionName("Redo", state.redoLabel)}
        title={actionName("Redo", state.redoLabel)}
      >
        <Redo2 aria-hidden="true" />
        <span>Redo</span>
      </Button>
      <EditorVersions state={state} />
    </div>
  );
}
