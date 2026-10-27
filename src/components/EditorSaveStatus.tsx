import { useEditorSaveStatus } from "../hooks/useEditorSaveStatus";
import { retryEditorSaves } from "../editor-save-queue";
import { Button } from "./primitives";
export function EditorSaveStatus() {
  const statuses = useEditorSaveStatus();
  const failures = statuses.filter(
    (status) => status.state === "unsaved" || status.state === "conflict",
  );
  if (!failures.length) return null;
  return (
    <aside className="editor-save-status" aria-label="Recording save status">
      {failures.map((status, index) => (
        <div key={`${status.recordingId}-${index}`} role="alert">
          <span>
            {status.state === "conflict"
              ? "Recording changed in another tab. Your edits have not been saved."
              : "Recording edits have not been saved."}{" "}
            {status.error}
          </span>
          {status.state === "conflict" ? (
            <Button onClick={() => window.location.reload()}>Reload</Button>
          ) : (
            <Button
              onClick={() => {
                void retryEditorSaves(status.recordingId).catch(() => {});
              }}
            >
              Retry save
            </Button>
          )}
        </div>
      ))}
    </aside>
  );
}
