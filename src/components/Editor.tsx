import { INSTRUMENTS } from "../instruments";
import { useEditor } from "../hooks/useEditor";
import { MelodyPanel } from "./MelodyPanel";
import { Breadcrumb, Button, Field } from "./primitives";

function Playhead({ left }: { left: string | null }) {
  return <div className="playhead" hidden={left === null} style={{ left: left ?? undefined }} />;
}

function PlaybackButton({
  kind,
  playing,
  disabled,
  onClick,
}: {
  kind: "audio" | "midi";
  playing: "audio" | "midi" | null;
  disabled: boolean;
  onClick: (kind: "audio" | "midi") => void;
}) {
  return (
    <Button className="play" disabled={disabled} onClick={() => onClick(kind)}>
      {playing === kind ? "■ Stop" : `▶ Play ${kind === "midi" ? "MIDI" : "audio"}`}
    </Button>
  );
}

export function Editor({ id }: { id: string }) {
  const state = useEditor(id);
  const playhead =
    state.position === null || !state.record
      ? null
      : `${Math.min(100, (state.position / state.record.durationSec) * 100)}%`;
  return (
    <div id="view-editor">
      <Breadcrumb current="Recording" />
      <div className="pair">
        <section className="side">
          <div className="side-head">
            <h2>Recording</h2>
            <span className="hint">{state.meta}</span>
          </div>
          <div className="grid-wrap">
            <canvas className="trace roll" ref={state.traceRef} />
            <Playhead left={playhead} />
          </div>
          <div className="row actions">
            <PlaybackButton
              kind="audio"
              playing={state.playing}
              disabled={!state.record}
              onClick={state.togglePlayback}
            />
            <Button
              className="export"
              disabled={!state.record}
              onClick={state.downloadWav}
              title="The raw recorded audio."
            >
              ⬇ .wav
            </Button>
            <Button disabled={!state.record} onClick={state.downloadJson} title="Diagnostics data.">
              ⬇ .json
            </Button>
            <Button disabled={!state.record} onClick={() => void state.copyLog()}>
              Copy log
            </Button>
            <span className="hint">{state.copyStatus}</span>
          </div>
          <div style={{ marginTop: "1.1rem" }}>
            <Field label="Name" htmlFor="ed-name">
              <input
                id="ed-name"
                type="text"
                value={state.draftName}
                onChange={(event) => state.setDraftName(event.target.value)}
                onBlur={state.commitName}
                disabled={!state.record}
              />
            </Field>
          </div>
          <div className="row">
            <Button disabled={!state.record} onClick={() => void state.duplicate()}>
              Duplicate
            </Button>
            <Button
              disabled={!state.record}
              variant="danger"
              className="spacer"
              onClick={() => void state.remove()}
            >
              Delete recording
            </Button>
          </div>
          <textarea
            id="ed-log-out"
            ref={state.logRef}
            value={state.reportText}
            readOnly
            spellCheck={false}
            hidden={!state.reportText}
          />
        </section>
        <section className="side">
          <div className="side-head">
            <h2>MIDI</h2>
            <span className="hint">{state.notesLabel}</span>
          </div>
          <div className="grid-wrap">
            <canvas
              className="trace roll"
              ref={state.rollRef}
              onClick={state.clickRoll}
              onMouseMove={state.moveRoll}
              style={{ cursor: state.rollHover ? "pointer" : undefined }}
              title="Click a note to hear it, Ctrl+click to mute or unmute it."
            />
            <Playhead left={playhead} />
          </div>
          <div className="row actions">
            <PlaybackButton
              kind="midi"
              playing={state.playing}
              disabled={!state.record}
              onClick={state.togglePlayback}
            />
            <Button
              variant="primary"
              className="export"
              disabled={!state.record}
              onClick={state.downloadMidi}
              title="Import into a DAW on an instrument track."
            >
              ⬇ .mid
            </Button>
            <select
              className="spacer"
              value={state.play.instrument}
              disabled={!state.record || state.externalOutput}
              onChange={(event) =>
                state.changePlay({
                  ...state.play,
                  instrument: event.target.value as typeof state.play.instrument,
                })
              }
              title={
                state.externalOutput
                  ? "Playing through a MIDI device — it picks the sound."
                  : "Instrument for playback (the .mid has no instrument)."
              }
            >
              {INSTRUMENTS.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.label}
                </option>
              ))}
            </select>
            <select
              value={state.play.octave}
              disabled={!state.record}
              onChange={(event) =>
                state.changePlay({ ...state.play, octave: Number(event.target.value) })
              }
              title="Shift playback by octaves (doesn't affect the .mid)."
            >
              <option value="1">+1 oct</option>
              <option value="0">±0 oct</option>
              <option value="-1">−1 oct</option>
              <option value="-2">−2 oct</option>
              <option value="-3">−3 oct</option>
            </select>
          </div>
          <p className="selected-note" aria-live="polite">
            {state.selectedNote
              ? `Selected: ${state.selectedNote.name} · ${state.selectedNote.start.toFixed(2)}s · ${state.selectedNote.duration.toFixed(2)}s long`
              : "Click a note to see its name and hear it."}
          </p>
          {state.selectedNote ? (
            <Button onClick={state.previewContext}>Hear in context</Button>
          ) : null}
          <details className="more">
            <summary>Notes</summary>
            <div className="note-list">
              {state.items.map((item, index) => (
                <Button
                  key={`${item.raw.start}-${index}`}
                  aria-label={`${item.note.name} at ${item.note.start.toFixed(2)} seconds${item.muted ? ", muted" : ""}`}
                  onClick={() => state.selectNote(item)}
                >
                  {item.note.name} · {item.note.start.toFixed(2)}s{item.muted ? " · muted" : ""}
                </Button>
              ))}
            </div>
          </details>
          <MelodyPanel
            melody={state.melody}
            interpretation={state.interpretation}
            disabled={!state.record}
            previewId={state.previewId}
            applyPreset={state.applyPreset}
            changeKnob={state.changeKnob}
            resetKnob={state.resetKnob}
            changeKey={state.changeKey}
            previewMelody={state.previewMelody}
          />
          <p className="hint">
            Click a note to hear it, Ctrl/Cmd+click to mute or unmute it. Melody settings are saved
            with this recording. Double-click a control label to reset it.
          </p>
        </section>
      </div>
    </div>
  );
}
