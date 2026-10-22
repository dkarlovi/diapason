import { useCapture } from "../hooks/useCapture";
import { Breadcrumb, Button, Panel } from "./primitives";

export function Capture() {
  useCapture();
  return (
    <div id="view-capture">
      <Breadcrumb current="New recording" />
      <Panel title="1 — Signal">
        <div className="field">
          <label htmlFor="cap-device">Microphone</label>
          <div className="row">
            <select id="cap-device" style={{ flex: 1 }} />
            <Button id="cap-refresh" title="Re-scan">
              ↻
            </Button>
          </div>
        </div>
        <label>Raw-audio status (all should be OFF)</label>
        <div className="badges" id="cap-dsp" />
        <label>Input level — keep out of the red</label>
        <div className="meter" id="cap-level-meter">
          <div />
        </div>
        <p className="hint" id="cap-level-hint">
          Whistle a steady note at your normal volume.
        </p>
        <div className="field" style={{ marginTop: ".7rem" }}>
          <label htmlFor="cap-gain">
            Input gain — <span id="cap-gain-v">1.0×</span>{" "}
            <span className="hint">(doesn't affect pitch accuracy)</span>
          </label>
          <input id="cap-gain" type="range" min="1" max="20" step="0.5" defaultValue="1" />
        </div>
      </Panel>
      <Panel title="2 — Room noise (required)">
        <div className="row">
          <Button id="cap-noise-btn">● Record the room (stay silent ~1.5s)</Button>
          <span className="hint" id="cap-noise-readout">
            not measured yet
          </span>
        </div>
        <label style={{ marginTop: ".8rem" }}>Live pitch check</label>
        <canvas className="trace" id="cap-trace" />
        <ul className="checklist" id="cap-verdict" />
      </Panel>
      <Panel title="3 — Tempo & record">
        <div className="row" style={{ marginBottom: ".9rem" }}>
          <div style={{ width: 120 }}>
            <label htmlFor="cap-bpm">Tempo (BPM)</label>
            <input id="cap-bpm" type="number" defaultValue="90" min="40" max="220" />
          </div>
          <div style={{ width: 120 }}>
            <label htmlFor="cap-beats">Beats / bar</label>
            <input id="cap-beats" type="number" defaultValue="4" min="1" max="12" />
          </div>
        </div>
        <div className="beatbox">
          <div className="beatdot" id="cap-beatdot" />
          <div className="count" id="cap-count" />
        </div>
        <div className="row">
          <Button id="cap-record" variant="primary" disabled>
            ● Record
          </Button>
          <Button id="cap-stop" disabled>
            ■ Stop & save
          </Button>
        </div>
        <p className="hint" id="cap-gate-hint">
          Record the room and get a clean signal to enable recording.
        </p>
        <p className="hint">
          A 1-bar count-in plays, then recording starts on the downbeat. The click is removed from
          pitch detection automatically.
        </p>
        <p className="hint" id="cap-status" />
      </Panel>
    </div>
  );
}
