import { EditorVersions } from "./EditorVersions";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";
import { MidiOutputPicker } from "./MidiOutputPicker";
import { Button } from "./primitives";
import type { EditorState } from "./editor-view-types";

export function EditorRecordingActions({ state }: { state: EditorState }) {
  const [open, setOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
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
  const actions = (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setShowVersions(false);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            className="editor-recording-menu"
            aria-label="Recording actions"
            title="Recording actions"
          >
            <Ellipsis aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className={showVersions ? "editor-versions" : "editor-recording-menu-items"}
          aria-label={showVersions ? "Saved versions" : "Recording action options"}
        >
          {showVersions ? (
            <>
              <Button
                className="editor-versions-back"
                aria-label="Back to recording actions"
                onClick={() => setShowVersions(false)}
              >
                ← Back
              </Button>
              <EditorVersions state={state} />
            </>
          ) : (
            <>
              <Button
                autoFocus
                disabled={state.editingDisabled}
                onClick={() => setShowVersions(true)}
              >
                Versions
              </Button>
              <div className="editor-mobile-midi">
                <MidiOutputPicker />
              </div>
              <Button
                disabled={!state.canEditPitch || !state.record?.noteEdits?.pitch.length}
                onClick={state.resetAllNoteEdits}
              >
                Reset all note edits
              </Button>
              {state.inactivePitchEditCount > 0 && (
                <span>{state.inactivePitchEditCount} inactive pitch edits</span>
              )}
              {[
                { label: "Download log", run: state.downloadLog },
                { label: "Download JSON", run: state.downloadJson },
                { label: "Copy log", run: state.copyLog },
                { label: "Duplicate", run: state.duplicate },
                { label: "Delete recording", run: state.remove },
              ].map((action) => (
                <Button
                  key={action.label}
                  disabled={
                    !state.record ||
                    (!state.analysisReady &&
                      ["Download log", "Download JSON", "Copy log"].includes(action.label))
                  }
                  variant={action.label === "Delete recording" ? "danger" : undefined}
                  onClick={() => {
                    setOpen(false);
                    void action.run();
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
  const nameSlot = document.getElementById("editor-title-slot"),
    actionSlot = document.getElementById("editor-actions-slot");
  return (
    <>
      {nameSlot ? createPortal(name, nameSlot) : name}
      {actionSlot ? createPortal(actions, actionSlot) : actions}
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
