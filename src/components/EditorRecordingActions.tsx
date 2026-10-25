import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { MidiOutputPicker } from "./MidiOutputPicker";
import { Button } from "./primitives";
import type { EditorState } from "./editor-view-types";

export function EditorRecordingActions({ state }: { state: EditorState }) {
  const name = (
    <input
      aria-label="Recording name"
      className="editor-recording-name"
      value={state.draftName}
      onChange={(event) => state.setDraftName(event.target.value)}
      onBlur={state.commitName}
      disabled={!state.record}
    />
  );
  const close = (control: HTMLElement) => {
    const menu = control.closest("details");
    if (menu) {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
  };
  const actions = (
    <details
      className="editor-recording-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape") close(event.currentTarget);
      }}
    >
      <summary aria-label="Recording actions" title="Recording actions">
        <Ellipsis aria-hidden="true" />
      </summary>
      <div className="editor-recording-menu-items">
        <div className="editor-mobile-midi">
          <MidiOutputPicker />
        </div>
        {[
          { label: "Download log", run: state.downloadLog },
          { label: "Download JSON", run: state.downloadJson },
          { label: "Copy log", run: state.copyLog },
          { label: "Duplicate", run: state.duplicate },
          { label: "Delete recording", run: state.remove },
        ].map((action) => (
          <Button
            key={action.label}
            disabled={!state.record}
            variant={action.label === "Delete recording" ? "danger" : undefined}
            onClick={(event) => {
              close(event.currentTarget);
              void action.run();
            }}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </details>
  );
  const nameSlot = document.getElementById("editor-title-slot"),
    actionSlot = document.getElementById("editor-actions-slot");
  return (
    <>
      {nameSlot ? createPortal(name, nameSlot) : name}
      {actionSlot ? createPortal(actions, actionSlot) : actions}
      <p className="editor-export-status" role="status" hidden={!state.copyStatus}>
        {state.copyStatus}
      </p>
      <textarea
        id="ed-log-out"
        ref={state.logRef}
        value={state.reportText}
        readOnly
        spellCheck={false}
        hidden={!state.copyStatus.startsWith("select")}
        aria-label="Recording diagnostic log"
      />
    </>
  );
}
