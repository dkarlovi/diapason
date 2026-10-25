import { X } from "lucide-react";
import { INSTRUMENTS } from "../instruments";
import { Button, Field } from "./primitives";
import { MelodyPanel } from "./MelodyPanel";
import type { EditorState } from "./editor-view-types";
import type { EditorLayout } from "../hooks/useEditorLayout";

function PlaybackSettings({ state }: { state: EditorState }) {
  return (
    <div className="editor-playback-settings">
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
          {[1, 0, -1, -2, -3].map((octave) => (
            <option value={octave} key={octave}>
              {octave === 0
                ? "Original octave"
                : `${octave > 0 ? "+" : "−"}${Math.abs(octave)} octave${Math.abs(octave) > 1 ? "s" : ""}`}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
export function MelodyTools({ state, layout }: { state: EditorState; layout: EditorLayout }) {
  return (
    <>
      <div
        className="editor-tune-resizer"
        role="separator"
        aria-label="Resize Tune sidebar"
        aria-orientation="vertical"
        aria-valuemin={286}
        aria-valuemax={Math.round(layout.maxWidth)}
        aria-valuenow={Math.round(layout.width)}
        tabIndex={layout.open ? 0 : -1}
        hidden={!layout.open}
        onKeyDown={layout.resizeKey}
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={layout.drag}
      />
      <section className="editor-tune" aria-label="Tune melody" hidden={!layout.open}>
        <div className="editor-tune-heading">
          <h2>Tune melody</h2>
          <Button
            onClick={() => {
              state.stopPlayback();
              state.resetKnob();
            }}
            disabled={!state.record}
          >
            Reset
          </Button>
          <Button aria-label="Close Tune" onClick={() => layout.setOpen(false)}>
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="editor-tune-body">
          <MelodyPanel
            melody={state.melody}
            interpretation={state.interpretation}
            disabled={!state.record}
            previewId={state.previewId}
            applyPreset={(id) => {
              state.stopPlayback();
              state.applyPreset(id);
            }}
            changeKnob={(key, value) => {
              state.stopPlayback();
              state.changeKnob(key, value);
            }}
            resetKnob={(key) => {
              state.stopPlayback();
              state.resetKnob(key);
            }}
            changeKey={(key) => {
              state.stopPlayback();
              state.changeKey(key);
            }}
            previewMelody={(change, id) => {
              state.previewMelody(change, id);
              if (layout.mobile) layout.setOpen(false);
            }}
          >
            <PlaybackSettings state={state} />
          </MelodyPanel>
        </div>
      </section>
    </>
  );
}
