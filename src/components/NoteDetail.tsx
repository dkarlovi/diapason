import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Play, Square } from "lucide-react";
import { Button } from "./primitives";
import { Popover, PopoverAnchor, PopoverContent } from "./ui/popover";
import { traceHorizontalPadding } from "../trace";
import type { EditorState } from "./editor-view-types";

export function NoteDetail({ state }: { state: EditorState }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const canvas = state.rollRef.current;
    if (!canvas) return;
    const update = () => setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(canvas);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [state.rollRef]);
  const note = state.selectedNote;
  const [copyStatus, setCopyStatus] = useState("");
  const copyTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  if (!note) return null;
  const contextPlaying = state.previewId === `note-${note.start}`;
  const view = state.viewport.view;
  const padding = traceHorizontalPadding(size.width, view.inset);
  const plotWidth = size.width - padding.left - padding.right;
  const left = padding.left + ((note.start - view.tMin) / (view.tMax - view.tMin)) * plotWidth;
  const width = (note.duration / (view.tMax - view.tMin)) * plotWidth;
  const top = ((view.midiMax - note.midi) / (view.midiMax - view.midiMin)) * size.height;
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) state.clearSelection();
      }}
    >
      <PopoverAnchor asChild>
        <span
          className="editor-note-anchor editor-note-active"
          style={{
            left,
            top,
            width: Math.max(2, width),
            height: (size.height / (view.midiMax - view.midiMin)) * (view.noteHeight ?? 1),
          }}
          aria-hidden="true"
        />
      </PopoverAnchor>
      <PopoverContent
        className="editor-note-detail"
        aria-label={`Note #${state.selectedNoteId} ${note.name}`}
        align="start"
        side="bottom"
        sideOffset={12}
        collisionBoundary={state.rollRef.current}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() => state.rollRef.current?.focus()}
        onInteractOutside={(event) => {
          // Canvas clicks select the next note or clear the selection themselves.
          if (event.target === state.rollRef.current) event.preventDefault();
        }}
      >
        <div className="editor-note-actions">
          <Button
            className="editor-copy-id"
            aria-label={copyStatus || "Copy ID"}
            onClick={() => {
              void (async () => {
                try {
                  await navigator.clipboard.writeText(`Note #${state.selectedNoteId}`);
                  setCopyStatus("ID copied");
                } catch {
                  setCopyStatus("Copy failed");
                }
                window.clearTimeout(copyTimer.current);
                copyTimer.current = window.setTimeout(() => setCopyStatus(""), 2000);
              })();
            }}
          >
            <span aria-hidden="true" style={{ visibility: copyStatus ? "hidden" : "visible" }}>
              Copy ID
            </span>
            {copyStatus === "ID copied" && <Check aria-hidden="true" />}
            {copyStatus === "Copy failed" && <span aria-hidden="true">!</span>}
          </Button>
          <Button
            onClick={contextPlaying ? state.stopPlayback : state.previewContext}
            aria-label={contextPlaying ? "Stop context playback" : "Hear in context"}
            aria-pressed={contextPlaying}
          >
            {contextPlaying ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
          </Button>
          <Button onClick={state.muteSelected}>{state.selectedMuted ? "Unmute" : "Mute"}</Button>
        </div>
        <div className="editor-note-info">
          <strong>Note #{state.selectedNoteId}</strong>
          <strong>{note.name}</strong>
          <span>
            {note.start.toFixed(2)} s · {note.duration.toFixed(2)} s
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
