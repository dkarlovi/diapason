import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Play, Plus, RotateCcw, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "../../UI/Button";
import { Popover, PopoverAnchor, PopoverContent } from "../../UI/Popover";
import { traceHorizontalPadding } from "../../Audio/Trace";
import type { EditorState } from "./useEditor";
import type { EditorLayout } from "./useEditorLayout";

export function NoteDetail({ state, layout }: { state: EditorState; layout: EditorLayout }) {
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
  if (!note) return null;
  const view = state.viewport.view;
  const padding = traceHorizontalPadding(size.width, view.inset);
  const plotWidth = size.width - padding.left - padding.right;
  const left = padding.left + ((note.start - view.tMin) / (view.tMax - view.tMin)) * plotWidth;
  const width = (note.duration / (view.tMax - view.tMin)) * plotWidth;
  const top = ((view.midiMax - note.midi) / (view.midiMax - view.midiMin)) * size.height;
  const anchor = (
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
  );
  const label = `Note #${state.selectedNoteId} ${note.name}`;
  if (layout.mobile)
    return (
      <>
        {anchor}
        <NoteSheet state={state} layout={layout} label={label} midi={note.midi} />
      </>
    );
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) state.clearSelection();
      }}
    >
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent
        className="editor-note-detail"
        aria-label={label}
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
        <NoteInspector state={state} />
      </PopoverContent>
    </Popover>
  );
}

/** Phones dock the inspector below the roll and keep the selected note above it. */
function NoteSheet({
  state,
  layout,
  label,
  midi,
}: {
  state: EditorState;
  layout: EditorLayout;
  label: string;
  midi: number;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const { open, setOpen } = layout;
  useEffect(() => {
    if (open) setOpen(false);
  }, [open, setOpen]);
  const { revealPitch } = state.viewport;
  const revealRef = useRef(revealPitch);
  revealRef.current = revealPitch;
  useLayoutEffect(() => {
    const roll = state.rollRef.current?.clientHeight;
    const sheet = sheetRef.current?.offsetHeight;
    if (roll && sheet) revealRef.current(midi, Math.min(0.8, sheet / roll));
  }, [midi, state.rollRef]);
  return (
    <section
      ref={sheetRef}
      className="editor-note-detail editor-note-sheet"
      role="dialog"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        state.clearSelection();
        state.rollRef.current?.focus();
      }}
    >
      <NoteInspector state={state} />
    </section>
  );
}

function NoteInspector({ state }: { state: EditorState }) {
  const note = state.selectedNote!;
  const contextPlaying = state.previewId === `note-${note.start}`;
  const contextLabel = contextPlaying ? "Stop context playback" : "Hear in context";
  return (
    <>
      <div className="editor-note-heading">
        <strong>
          #{state.selectedNoteId} · {note.name}
        </strong>
        <span className="editor-note-time">
          {note.start.toFixed(2)} s · {note.duration.toFixed(2)} s
        </span>
        <Button
          className="editor-note-toggle playback-control"
          onClick={contextPlaying ? state.stopPlayback : state.previewContext}
          aria-label={contextLabel}
          title={contextLabel}
          aria-pressed={contextPlaying}
        >
          {contextPlaying ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <Button
          className="editor-note-toggle"
          onClick={state.muteSelected}
          disabled={!state.canEditPitch}
          aria-label="Mute note"
          title={state.selectedMuted ? "Muted (M)" : "Mute (M)"}
          aria-pressed={state.selectedMuted}
        >
          {state.selectedMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </Button>
      </div>
      <div className="editor-note-properties">
        <NoteProperty
          label="Pitch"
          value={note.name}
          edited={state.selectedPitchEdited}
          decrease={{
            label: "Down one semitone",
            disabled: !state.canEditPitch || note.midi <= 0,
            run: () => state.shiftSelectedPitch(-1),
          }}
          increase={{
            label: "Up one semitone",
            disabled: !state.canEditPitch || note.midi >= 127,
            run: () => state.shiftSelectedPitch(1),
          }}
          reset={{
            label: "Reset pitch",
            disabled: !state.canEditPitch,
            run: state.resetSelectedPitch,
          }}
        />
      </div>
    </>
  );
}

interface PropertyAction {
  label: string;
  disabled: boolean;
  run(): void;
}

/** One editable note property; every row keeps the same columns whether or not it is edited. */
function NoteProperty({
  label,
  value,
  edited,
  decrease,
  increase,
  reset,
}: {
  label: string;
  value: string;
  edited: boolean;
  decrease: PropertyAction;
  increase: PropertyAction;
  reset: PropertyAction;
}) {
  return (
    <div className="editor-note-property" data-edited={edited}>
      <span className="editor-edit-swatch" aria-hidden="true" />
      <span className="editor-note-property-label">
        {label}
        {edited && <span className="sr-only">, edited</span>}
      </span>
      <Button
        className="editor-note-step"
        aria-label={decrease.label}
        title={decrease.label}
        disabled={decrease.disabled}
        onClick={decrease.run}
      >
        <Minus aria-hidden="true" />
      </Button>
      <output className="editor-note-value">{value}</output>
      <Button
        className="editor-note-step"
        aria-label={increase.label}
        title={increase.label}
        disabled={increase.disabled}
        onClick={increase.run}
      >
        <Plus aria-hidden="true" />
      </Button>
      <Button
        className="editor-reset"
        aria-label={reset.label}
        title={reset.label}
        disabled={reset.disabled || !edited}
        onClick={reset.run}
      >
        <RotateCcw aria-hidden="true" />
      </Button>
    </div>
  );
}
