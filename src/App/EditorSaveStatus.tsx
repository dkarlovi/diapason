import { useEditorSaveStatus } from "./useEditorSaveStatus";
import { retryEditorSaves } from "../Editing/EditorSaveQueue";
import { Button } from "../UI/Button";

export function EditorSaveStatus() {
  const statuses = useEditorSaveStatus();
  const failures = statuses.filter((status) => status.state === "unsaved");
  if (!failures.length) return null;
  return (
    <aside className="editor-save-status" aria-label="Recording save status">
      {failures.map((status, index) => (
        <div key={`${status.recordingId}-${index}`} role="alert">
          <span>Recording edits have not been saved. {status.error}</span>
          <Button
            onClick={() => {
              void retryEditorSaves(status.recordingId).catch(() => {});
            }}
          >
            Retry save
          </Button>
        </div>
      ))}
    </aside>
  );
}
