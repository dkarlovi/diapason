import { useState } from "react";
import { Ellipsis } from "lucide-react";
import type { EditorState } from "./useEditor";
import { MidiOutputPicker } from "../../Studio/MidiOutputPicker";
import { Button } from "../../UI/Button";
import { Popover, PopoverContent, PopoverTrigger } from "../../UI/Popover";

export function EmbeddedRecordingActions({ state }: { state: EditorState }) {
  const [open, setOpen] = useState(false);
  const run = (action: () => unknown) => {
    setOpen(false);
    void action();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        className="editor-recording-menu-items embed-recording-menu"
        aria-label="Recording action options"
      >
        <MidiOutputPicker />
        {state.adHoc && (
          <Button disabled={state.editingDisabled} onClick={() => run(state.saveTune)}>
            Save
          </Button>
        )}
        <Button
          disabled={state.editingDisabled || state.sharing.busy}
          onClick={() => run(state.copyTuneLink)}
        >
          Copy tune link
        </Button>
        <Button
          disabled={!state.canEditPitch || !state.record?.noteEdits?.pitch.length}
          onClick={() => run(state.resetAllNoteEdits)}
        >
          Reset edits
        </Button>
        {!state.adHoc && !state.tuneLocked && (
          <Button variant="danger" disabled={!state.record} onClick={() => run(state.remove)}>
            Delete recording
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
