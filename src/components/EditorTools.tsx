import { X } from "lucide-react";
import { PlaybackSettings } from "./PlaybackSettings";
import { Button } from "./primitives";
import { MelodyPanel } from "./MelodyPanel";
import type { EditorState } from "./editor-view-types";
import type { EditorLayout } from "../hooks/useEditorLayout";

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
            }}
          >
            <PlaybackSettings state={state} />
          </MelodyPanel>
        </div>
        <div className="editor-tune-footer">
          <Button
            disabled={!state.record}
            onClick={() => {
              if (!confirm("Reset all tuning controls to the current preset defaults?")) return;
              state.stopPlayback();
              state.resetKnob();
            }}
          >
            Reset
          </Button>
        </div>
      </section>
    </>
  );
}
