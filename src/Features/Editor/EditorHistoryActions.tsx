import { Undo2, Redo2 } from "lucide-react";
import { Button } from "../../UI/Primitives";
import type { EditorState } from "./useEditor";
type HistoryState = Pick<
  EditorState,
  "canUndo" | "canRedo" | "undoLabel" | "redoLabel" | "undo" | "redo" | "editingDisabled"
>;
const actionName = (verb: string, label: string | null) =>
  label ? `${verb} ${label.charAt(0).toLowerCase()}${label.slice(1)}` : verb;
export function EditorHistoryActions({ state }: { state: HistoryState }) {
  const actions = [
    { verb: "Undo", icon: Undo2, enabled: state.canUndo, label: state.undoLabel, run: state.undo },
    { verb: "Redo", icon: Redo2, enabled: state.canRedo, label: state.redoLabel, run: state.redo },
  ];
  return (
    <div className="editor-history-actions" role="group" aria-label="Editing history">
      {actions.map(({ verb, icon: Icon, enabled, label, run }) => (
        <Button
          key={verb}
          disabled={!enabled || state.editingDisabled}
          onClick={run}
          aria-label={actionName(verb, label)}
          title={actionName(verb, label)}
        >
          <Icon aria-hidden="true" />
          <span>{verb}</span>
        </Button>
      ))}
    </div>
  );
}
