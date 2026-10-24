import type { PropsWithChildren } from "react";
import { INSTRUMENTS } from "../instruments";
import { Button, Field } from "./primitives";
import { MelodyPanel } from "./MelodyPanel";
import type { EditorState } from "./editor-view-types";

function Toolbox({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <section className="editor-toolbox">
      <h2 className="toolbox-heading">{title}</h2>
      <div className="toolbox-body">{children}</div>
    </section>
  );
}

export function RecordingTools({ state }: { state: EditorState }) {
  return (
    <Toolbox title="Recording settings">
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
      <div className="tool-section">
        <h3>Recording actions</h3>
        <div className="row">
          <Button disabled={!state.record} onClick={() => void state.duplicate()}>
            Duplicate
          </Button>
          <Button disabled={!state.record} variant="danger" onClick={() => void state.remove()}>
            Delete recording
          </Button>
        </div>
      </div>
      <div className="tool-section">
        <h3>Diagnostics</h3>
        <div className="row">
          <Button disabled={!state.record} onClick={state.downloadJson}>
            Download JSON
          </Button>
          <Button disabled={!state.record} onClick={() => void state.copyLog()}>
            Copy log
          </Button>
          <span className="hint" role="status">
            {state.copyStatus}
          </span>
        </div>
      </div>
      <textarea
        id="ed-log-out"
        ref={state.logRef}
        value={state.reportText}
        readOnly
        spellCheck={false}
        hidden={!state.reportText}
        aria-label="Recording diagnostic log"
      />
    </Toolbox>
  );
}

function PlaybackSettings({ state }: { state: EditorState }) {
  return (
    <details className="tool-section">
      <summary>Playback</summary>
      <Field label="Instrument" htmlFor="ed-instrument">
        <select
          id="ed-instrument"
          value={state.play.instrument}
          disabled={!state.record || state.externalOutput}
          onChange={(event) =>
            state.changePlay({
              ...state.play,
              instrument: event.target.value as typeof state.play.instrument,
            })
          }
        >
          {INSTRUMENTS.map((instrument) => (
            <option key={instrument.id} value={instrument.id}>
              {instrument.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Octave" htmlFor="ed-octave">
        <select
          id="ed-octave"
          value={state.play.octave}
          disabled={!state.record}
          onChange={(event) =>
            state.changePlay({ ...state.play, octave: Number(event.target.value) })
          }
        >
          <option value="1">+1 octave</option>
          <option value="0">Original octave</option>
          <option value="-1">−1 octave</option>
          <option value="-2">−2 octaves</option>
          <option value="-3">−3 octaves</option>
        </select>
      </Field>
    </details>
  );
}

function NoteTools({ state }: { state: EditorState }) {
  return (
    <details className="tool-section">
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
      <p className="hint">Click to preview. Ctrl/Cmd+click in the roll to mute a note.</p>
    </details>
  );
}

export function MelodyTools({ state }: { state: EditorState }) {
  return (
    <Toolbox title="Melody controls">
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
      <PlaybackSettings state={state} />
      <NoteTools state={state} />
    </Toolbox>
  );
}
