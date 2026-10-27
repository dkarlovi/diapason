import { useEditorHistoryKeys } from "../hooks/useEditorHistoryKeys";
import { useEffect, type CSSProperties } from "react";
import { Link } from "react-router";
import { useEditor } from "../hooks/useEditor";
import { useEditorLayout } from "../hooks/useEditorLayout";
import { useStudioTitle } from "../hooks/useStudioTitle";
import { EditorCanvas } from "./EditorCanvas";
import { MelodyTools } from "./EditorTools";
import { EditorRecordingActions } from "./EditorRecordingActions";
import { Button } from "./primitives";

export function Editor({ id }: { id: string }) {
  const state = useEditor(id);
  const layout = useEditorLayout();
  useEditorHistoryKeys({
    enabled: !state.editingDisabled,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    undo: state.undo,
    redo: state.redo,
  });
  useStudioTitle(state.record?.name ?? "Recording");
  const { setVisible } = state.viewport;
  useEffect(() => {
    setVisible(layout.visibleFraction);
  }, [setVisible, layout.visibleFraction]);
  return (
    <div id="view-editor">
      <Link className="capture-library-fallback" to="/">
        Library
      </Link>
      <EditorRecordingActions state={state} />
      <div
        className="editor-workspace"
        ref={layout.workspaceRef}
        data-tuning={layout.open}
        data-source-hidden={layout.sourceHidden}
        style={{ "--tune-width": `${layout.width}px` } as CSSProperties}
      >
        <EditorCanvas kind="audio" state={state} layout={layout} />
        <EditorCanvas kind="midi" state={state} layout={layout} />
        <Button
          className="editor-source-handle"
          aria-expanded={!layout.sourceHidden}
          onClick={() => {
            if (!layout.sourceHidden && state.playing === "audio") state.stopPlayback();
            layout.toggleSource();
          }}
        >
          {layout.sourceHidden ? "Show original" : "Hide original"}
        </Button>
        <MelodyTools state={state} layout={layout} />
      </div>
    </div>
  );
}
