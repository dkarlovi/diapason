import type { KeyboardEvent } from "react";
import { Download, Play, Square } from "lucide-react";
import { Button } from "./primitives";
import { NoteDetail } from "./NoteDetail";
import { EditorNavigation } from "./EditorNavigation";
import { PitchCanvas } from "./PitchCanvas";
import type { EditorState } from "./editor-view-types";
import type { EditorLayout } from "../hooks/useEditorLayout";

function rollKeyboard(event: KeyboardEvent<HTMLCanvasElement>, state: EditorState) {
  const index = state.items.findIndex((item) => item.note === state.selectedNote);
  const indices: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    Home: 0,
    End: state.items.length - 1,
  };
  if (event.key in indices) {
    event.preventDefault();
    const item = state.items[Math.min(state.items.length - 1, Math.max(0, indices[event.key]!))];
    if (item) state.selectNote(item);
  } else if (event.key === "m" || event.key === "M") {
    event.preventDefault();
    state.muteSelected();
  } else if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    const item = state.items[index];
    if (item) state.selectNote(item);
  }
}
type CanvasProps = { kind: "audio" | "midi"; state: EditorState; layout: EditorLayout };
function CanvasPlot({ kind, state }: Pick<CanvasProps, "kind" | "state">) {
  if (kind === "audio")
    return (
      <PitchCanvas
        className="editor-plot"
        ref={state.traceRef}
        aria-label="Original pitch trace"
        title="Original recorded pitch"
      />
    );
  return (
    <PitchCanvas
      className="editor-plot"
      ref={state.rollRef}
      aria-label="MIDI piano roll"
      tabIndex={0}
      aria-describedby="roll-instructions"
      title="Click a note to hear it, Ctrl+click to mute or unmute it."
      onClick={state.clickRoll}
      onMouseMove={state.moveRoll}
      onKeyDown={(event) => rollKeyboard(event, state)}
      style={{ cursor: state.rollHover ? "pointer" : undefined }}
    />
  );
}
function TrackLabel({ kind, state }: Pick<CanvasProps, "kind" | "state">) {
  const midi = kind === "midi";
  const label = midi ? state.notesLabel : state.meta;
  const title = midi ? (state.previewLabel ? "MIDI preview" : "MIDI melody") : "Original recording";
  return (
    <div className="editor-track-label">
      <h2>{title}</h2>
      <span title={label}>{label}</span>
      {midi && (
        <time>
          {(state.position ?? 0).toFixed(1)} / {state.record?.durationSec.toFixed(1) ?? "0"} s
        </time>
      )}
    </div>
  );
}
function TrackActions({ kind, state, layout }: CanvasProps) {
  const playing = state.playing === kind;
  const download = kind === "midi" ? "Download MIDI" : "Download WAV";
  const label = kind === "midi" ? "MIDI" : "audio";
  return (
    <div className="editor-track-actions">
      {kind === "midi" && (
        <Button
          className="editor-open-tune"
          aria-label="Toggle Tune"
          aria-expanded={layout.open}
          aria-pressed={layout.open}
          onClick={() => layout.setOpen(!layout.open)}
        >
          Tune ☷
        </Button>
      )}
      <Button
        variant="primary"
        disabled={!state.record}
        aria-label={`${playing ? "Stop" : "Play"} ${label}`}
        aria-pressed={playing}
        onClick={() => state.togglePlayback(kind)}
      >
        {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        {playing ? "Stop" : "Play"}
      </Button>
      <Button
        aria-label={download}
        title={download}
        disabled={!state.record}
        onClick={kind === "midi" ? state.downloadMidi : state.downloadWav}
      >
        <Download aria-hidden="true" />
      </Button>
    </div>
  );
}
function PlaybackStatus({ state }: { state: EditorState }) {
  if (!state.playing) return null;
  let label = state.playing === "audio" ? "Playing original recording" : "Playing MIDI melody";
  if (state.previewId) label = "Playing note in context";
  if (state.previewLabel) label = `Playing preview · ${state.previewLabel} · Not applied`;
  return (
    <div className="editor-playing" role="status">
      {label}
    </div>
  );
}
function MidiOverlays({ state }: Pick<CanvasProps, "state">) {
  return (
    <>
      <p id="roll-instructions" className="sr-only">
        Arrow keys select and preview notes. Enter or Space plays the selected note. M mutes or
        unmutes it. Control or Command click also mutes a note. Middle-button drag pans the canvas.
        Touch drag pans the canvas. Pinch horizontally to zoom time and vertically to zoom pitch.
        Control plus wheel zooms time. Shift plus wheel zooms pitch. Escape dismisses note details.
      </p>
      <NoteDetail key={state.selectedNoteId ?? "none"} state={state} />
      <PlaybackStatus state={state} />
      <Button
        className="editor-trace-toggle"
        aria-pressed={state.viewport.traceOverlay}
        onClick={() => state.viewport.setTraceOverlay(!state.viewport.traceOverlay)}
      >
        Trace overlay
      </Button>
      <EditorNavigation state={state} />
    </>
  );
}
export function EditorCanvas(props: CanvasProps) {
  const { kind, state, layout } = props;
  return (
    <section
      className={`editor-canvas editor-${kind}`}
      aria-label={kind === "midi" ? "MIDI melody" : "Original recording"}
      hidden={kind === "audio" && layout.sourceHidden}
    >
      <CanvasPlot kind={kind} state={state} />
      <TrackLabel kind={kind} state={state} />
      <TrackActions kind={kind} state={state} layout={layout} />
      {kind === "midi" && <MidiOverlays state={state} />}
    </section>
  );
}
