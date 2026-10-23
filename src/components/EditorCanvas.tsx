import { Download, Headphones, Play, Square } from "lucide-react";
import { Button } from "./primitives";
import type { EditorState } from "./editor-view-types";

const CANVASES = {
  audio: {
    title: "Original recording",
    plot: "Original pitch trace",
    play: "Play audio",
    download: "Download WAV",
    extension: ".wav",
    variant: undefined,
  },
  midi: {
    title: "MIDI melody",
    plot: "MIDI piano roll",
    play: "Play MIDI",
    download: "Download MIDI",
    extension: ".mid",
    variant: "primary",
  },
} as const;
type Kind = keyof typeof CANVASES;

function PlaybackMarker({ state }: { state: EditorState }) {
  if (state.position === null || !state.record) return <div className="playhead" hidden />;
  const left = Math.min(100, (state.position / state.record.durationSec) * 100) + "%";
  return <div className="playhead" style={{ left }} />;
}

function CanvasSurface({ kind, state }: { kind: Kind; state: EditorState }) {
  const midi = kind === "midi";
  return (
    <div className="grid-wrap">
      <canvas
        className="trace roll themed-trace"
        role="img"
        aria-label={CANVASES[kind].plot}
        ref={midi ? state.rollRef : state.traceRef}
        onClick={midi ? state.clickRoll : undefined}
        onMouseMove={midi ? state.moveRoll : undefined}
        style={{ cursor: midi && state.rollHover ? "pointer" : undefined }}
        title={
          midi
            ? "Click a note to hear it, Ctrl+click to mute or unmute it."
            : "Original recorded pitch"
        }
      />
      <PlaybackMarker state={state} />
    </div>
  );
}

function CanvasReadout({ kind, state }: { kind: Kind; state: EditorState }) {
  let text = state.record
    ? state.record.bpm + " BPM · " + state.record.beatsPerBar + " beats/bar"
    : "Loading recording…";
  if (kind === "midi")
    text = state.selectedNote
      ? `Selected: ${state.selectedNote.name} · ${state.selectedNote.start.toFixed(2)}s · ${state.selectedNote.duration.toFixed(2)}s long`
      : "Select a note to preview";
  return (
    <div className="canvas-readout" aria-live={kind === "midi" ? "polite" : "off"}>
      <span>{text}</span>
      {kind === "midi" && state.selectedNote && (
        <Button onClick={state.previewContext} title="Hear in context">
          <Headphones aria-hidden="true" />
          Hear in context
        </Button>
      )}
      <span>{state.record ? state.record.durationSec.toFixed(1) + "s" : ""}</span>
    </div>
  );
}

export function EditorCanvas({ kind, state }: { kind: Kind; state: EditorState }) {
  const config = CANVASES[kind];
  const playing = state.playing === kind;
  const meta = kind === "midi" ? state.notesLabel : state.meta;
  const download = kind === "midi" ? state.downloadMidi : state.downloadWav;
  return (
    <section className="editor-canvas" aria-label={config.title}>
      <div className="canvas-heading">
        <h2>{config.title}</h2>
        <span title={meta}>{meta}</span>
      </div>
      <CanvasSurface kind={kind} state={state} />
      <CanvasReadout kind={kind} state={state} />
      <div className="canvas-actions">
        <Button
          disabled={!state.record}
          aria-pressed={playing}
          onClick={() => state.togglePlayback(kind)}
          title={playing ? "Stop playback" : config.play}
        >
          {playing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
          {playing ? "Stop" : config.play}
        </Button>
        <Button
          variant={config.variant}
          disabled={!state.record}
          onClick={download}
          aria-label={config.download}
        >
          <Download aria-hidden="true" />
          {config.extension}
        </Button>
      </div>
    </section>
  );
}
