import { TuneShareLink } from "../../Studio/TuneShareLink";
import { useStudioMode } from "../../Studio/useStudioMode";
import { Toast } from "../../UI/Toast";
import { useEditorHistoryKeys } from "./useEditorHistoryKeys";
import { useEffect, type CSSProperties } from "react";
import { Link } from "react-router";
import { useEditor } from "./useEditor";
import { useEditorLayout } from "./useEditorLayout";
import { useStudioTitle } from "../../Studio/useStudioTitle";
import { EditorCanvas } from "./EditorCanvas";
import { MelodyTools } from "./EditorTools";
import { EditorRecordingActions } from "./EditorRecordingActions";
import { Button } from "../../UI/Button";
import { EditorSessionNavigation } from "./AdHocNavigation";
import type { AdHocTuneSession } from "./useAdHocTune";
function ImportAnalysisNotice({ mismatch }: { mismatch: boolean }) {
  if (!mismatch) return null;
  return (
    <p role="status" className="recording-import-warning">
      Current analysis differs from the saved melody. The original result is preserved in the
      imported WAV metadata.
    </p>
  );
}

export function Editor({ id, session }: { id: string; session?: AdHocTuneSession }) {
  const state = useEditor(id, session);
  const { embedded, tuneLocked } = useStudioMode();
  const layout = useEditorLayout(state.capabilities?.audio ?? false);
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
      <EditorSessionNavigation
        id={id}
        session={session}
        embedded={embedded}
        tuneLocked={tuneLocked}
        beforeLeave={state.finishSession}
      />
      {!embedded && (
        <Link className="capture-library-fallback" to="/">
          Library
        </Link>
      )}
      {!embedded && <EditorRecordingActions state={state} />}
      {state.loadError && state.analysis.status !== "error" && (
        <div className="analysis-status analysis-error" role="alert">
          Could not load recording: {state.loadError}
          <Button onClick={state.retryAnalysis}>Retry loading</Button>
        </div>
      )}
      <ImportAnalysisNotice mismatch={state.importAnalysisMismatch} />
      <Toast notice={state.notice} onDismiss={state.dismissNotice} />
      <TuneShareLink
        floating
        link={state.sharing.fallbackLink}
        onClose={state.sharing.clearFallback}
      />
      <div
        className="editor-workspace"
        ref={layout.workspaceRef}
        data-tuning={layout.open}
        data-source-hidden={layout.sourceHidden}
        data-tune-motion={layout.motion.tune}
        data-source-motion={layout.motion.source}
        style={{ "--tune-width": `${layout.width}px` } as CSSProperties}
      >
        <EditorCanvas kind="audio" state={state} layout={layout} />
        <EditorCanvas kind="midi" state={state} layout={layout} />
        <Button
          className="editor-source-handle"
          hidden={embedded && !!state.record?.noteSource}
          disabled={!state.capabilities?.audio}
          title={
            state.record?.noteSource
              ? "The original audio was not included in this tune."
              : undefined
          }
          aria-description={
            state.record?.noteSource
              ? "The original audio was not included in this tune."
              : undefined
          }
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
