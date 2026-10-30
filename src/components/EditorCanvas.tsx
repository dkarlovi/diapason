import { useStudioMode } from "../hooks/useStudioMode";
import { EmbeddedBrand } from "./EmbeddedBrand";
import { EmbeddedRecordingActions } from "./EmbeddedRecordingActions";
import { AnalysisProgress } from "./AnalysisProgress";
import { EditorHistoryActions } from "./EditorHistoryActions";
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { Download, Play, Square } from "lucide-react";
import { Button } from "../UI/Primitives";
import { NoteDetail } from "./NoteDetail";
import { EditorNavigation } from "./EditorNavigation";
import { PitchCanvas } from "./PitchCanvas";
import type { EditorState } from "../hooks/useEditor";
import type { EditorLayout } from "../hooks/useEditorLayout";
import type { PlayheadStore } from "../playhead-store";

function rollKeyboard(event: KeyboardEvent<HTMLCanvasElement>, state: EditorState) {
  const index = state.items.findIndex((item) => item.note === state.selectedNote);
  const select = (target: number) => {
    const item = state.items[Math.min(state.items.length - 1, Math.max(0, target))];
    if (item) state.selectNote(item);
  };
  const actions: Record<string, () => void> = {
    ArrowRight: () => select(index + 1),
    ArrowLeft: () => select(index - 1),
    Home: () => select(0),
    End: () => select(state.items.length - 1),
    ArrowUp: () => state.shiftSelectedPitch(event.shiftKey ? 12 : 1),
    ArrowDown: () => state.shiftSelectedPitch(event.shiftKey ? -12 : -1),
    m: state.muteSelected,
    M: state.muteSelected,
    " ": () => select(index),
    Enter: () => select(index),
  };
  if (event.key === "Escape") state.clearSelection();
  const action = actions[event.key];
  if (!action) return;
  event.preventDefault();
  action();
}
const rollCursor = { drag: "ns-resize", note: "pointer", none: undefined };
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
      tabIndex={state.analysisReady ? 0 : -1}
      aria-hidden={!state.analysisReady}
      aria-describedby="roll-instructions"
      title="Click a note to hear it, Ctrl+click to mute or unmute it. Drag the selected note up or down to change its pitch."
      onClick={state.analysisReady ? state.clickRoll : undefined}
      onMouseMove={state.analysisReady ? state.moveRoll : undefined}
      onKeyDown={(event) => {
        if (state.analysisReady) rollKeyboard(event, state);
      }}
      style={{
        cursor: rollCursor[state.rollHover ?? "none"],
        visibility: state.analysisReady ? undefined : "hidden",
      }}
    />
  );
}
// Writes the readout straight from the playhead store so playback never re-renders React.
function PlayheadTime({
  playhead,
  duration,
}: {
  playhead: PlayheadStore;
  duration: number | undefined;
}) {
  const ref = useRef<HTMLTimeElement>(null);
  useLayoutEffect(() => {
    const total = duration?.toFixed(1) ?? "0";
    let shown = "";
    const show = ({ position }: { position: number | null }) => {
      const text = `${(position ?? 0).toFixed(1)} / ${total} s`;
      if (text === shown || !ref.current) return;
      ref.current.textContent = shown = text;
    };
    show(playhead.getState());
    return playhead.subscribe(show);
  }, [playhead, duration]);
  return <time ref={ref} />;
}
function TrackLabel({ kind, state }: Pick<CanvasProps, "kind" | "state">) {
  const midi = kind === "midi";
  const label = midi ? state.notesLabel : state.meta;
  const title = midi ? (state.previewLabel ? "MIDI preview" : "MIDI melody") : "Original recording";
  return (
    <div className="editor-track-label">
      <h2>{title}</h2>
      <span title={label}>{label}</span>
      {midi && <PlayheadTime playhead={state.playhead} duration={state.record?.durationSec} />}
    </div>
  );
}
function TrackDownload({ kind, state }: Pick<CanvasProps, "kind" | "state">) {
  const download = kind === "midi" ? "Download MIDI" : "Download WAV";
  return (
    <Button
      variant="primary"
      className="editor-download"
      aria-label={download}
      title={
        !state.canExport && state.previewLabel && !state.previewApplied
          ? "Apply or stop the preview before downloading"
          : download
      }
      disabled={
        !state.record || !state.canExport || (kind === "audio" && !state.capabilities?.audio)
      }
      onClick={kind === "midi" ? state.downloadMidi : state.downloadWav}
    >
      <Download aria-hidden="true" />
      <span>Download</span>
    </Button>
  );
}
function TrackActions({ kind, state, layout }: CanvasProps) {
  const { embedded } = useStudioMode();
  const playing = state.playing === kind;
  const label = kind === "midi" ? "MIDI" : "audio";
  return (
    <div className="editor-track-actions">
      {kind === "midi" && (
        <>
          <EditorHistoryActions state={state} />
          <Button
            className="editor-open-tune"
            aria-label="Toggle Tune"
            disabled={state.editingDisabled}
            aria-expanded={layout.open}
            aria-pressed={layout.open}
            onClick={() => {
              // On phones the docked note inspector and Tune share the same space.
              if (layout.mobile && !layout.open) state.clearSelection();
              layout.setOpen(!layout.open);
            }}
          >
            Tune ☷
          </Button>
        </>
      )}
      <Button
        className="editor-play playback-control"
        disabled={
          !state.record || (kind === "midi" ? !state.analysisReady : !state.capabilities?.audio)
        }
        aria-label={`${playing ? "Stop" : "Play"} ${label}`}
        title={`${playing ? "Stop" : "Play"} ${label}`}
        aria-pressed={playing}
        onClick={() => state.togglePlayback(kind)}
      >
        {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span className="editor-play-label">{playing ? "Stop" : "Play"}</span>
      </Button>
      <TrackDownload kind={kind} state={state} />
      {embedded && kind === "midi" && <EmbeddedRecordingActions state={state} />}
    </div>
  );
}
function MidiOverlays({ state, layout }: Pick<CanvasProps, "state" | "layout">) {
  const { embedded } = useStudioMode();
  return (
    <>
      <p id="roll-instructions" className="sr-only">
        Left and Right arrows, Home and End select and preview notes. Up and Down arrows change the
        selected note's pitch by a semitone, or an octave with Shift. Drag the selected note up or
        down to change its pitch. Enter or Space plays the selected note. M mutes or unmutes it.
        Control or Command click also mutes a note. Middle-button drag pans the canvas. Touch drag
        pans the canvas. Pinch horizontally to zoom time and vertically to zoom pitch. Control plus
        wheel zooms time. Shift plus wheel zooms pitch. Escape dismisses note details.
      </p>
      <NoteDetail key={state.selectedNoteId ?? "none"} state={state} layout={layout} />
      <div className="editor-canvas-footer">
        <Button
          className="editor-trace-toggle"
          hidden={embedded && !!state.record?.noteSource}
          disabled={!state.capabilities?.analysis}
          aria-pressed={state.viewport.traceOverlay}
          onClick={() => state.viewport.setTraceOverlay(!state.viewport.traceOverlay)}
        >
          Trace overlay
        </Button>
        <EditorNavigation state={state} />
      </div>
    </>
  );
}
export function EditorCanvas(props: CanvasProps) {
  const { kind, state, layout } = props;
  const { embedded } = useStudioMode();
  return (
    <section
      className={`editor-canvas editor-${kind}`}
      aria-label={kind === "midi" ? "MIDI melody" : "Original recording"}
      aria-hidden={kind === "audio" && layout.sourceHidden}
      inert={kind === "audio" && layout.sourceHidden}
    >
      <CanvasPlot kind={kind} state={state} />
      {kind === "audio" && state.record?.noteSource && (
        <p className="source-limitation">The original audio was not included in this tune.</p>
      )}
      <div className="editor-track-toolbar">
        {embedded && (kind === "audio" || layout.sourceHidden) && <EmbeddedBrand />}
        <TrackLabel kind={kind} state={state} />
        <TrackActions kind={kind} state={state} layout={layout} />
      </div>
      {kind === "midi" &&
        (state.analysisReady ? (
          <MidiOverlays state={state} layout={layout} />
        ) : (
          <div className="editor-analysis">
            <AnalysisProgress state={state.analysis} retry={state.retryAnalysis} />
          </div>
        ))}
    </section>
  );
}
