import { useState } from "react";
import { Ellipsis } from "lucide-react";
import type { EditorState } from "./editor-view-types";
import { MidiOutputPicker } from "./MidiOutputPicker";
import { Button } from "./primitives";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

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
        <Button
          disabled={!state.canEditPitch || !state.record?.noteEdits?.pitch.length}
          onClick={() => run(state.resetAllNoteEdits)}
        >
          Reset edits
        </Button>
        <Button variant="danger" disabled={!state.record} onClick={() => run(state.remove)}>
          Delete recording
        </Button>
      </PopoverContent>
    </Popover>
  );
}
