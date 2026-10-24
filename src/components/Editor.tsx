import { Link } from "react-router";
import { useEditor } from "../hooks/useEditor";
import { useStudioTitle } from "../hooks/useStudioTitle";
import { EditorCanvas } from "./EditorCanvas";
import { MelodyTools, RecordingTools } from "./EditorTools";

export function Editor({ id }: { id: string }) {
  const state = useEditor(id);
  useStudioTitle(state.record?.name ?? "Recording");
  return (
    <div id="view-editor">
      <Link className="capture-library-fallback" to="/">
        Library
      </Link>
      <div className="editor-layout">
        <div className="editor-canvases">
          <EditorCanvas kind="audio" state={state} />
          <EditorCanvas kind="midi" state={state} />
        </div>
        <div className="editor-toolboxes">
          <RecordingTools state={state} />
          <MelodyTools state={state} />
        </div>
      </div>
    </div>
  );
}
