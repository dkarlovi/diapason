import { useCapture } from "../hooks/useCapture";
import type { Check } from "../ui";
import { Breadcrumb, Button, Panel } from "./primitives";

export function Checklist({ checks }: { checks: Check[] }) {
  return (
    <ul className="checklist">
      {checks.map((check) => (
        <li key={check.label} className={check.pass ? "pass" : check.detail ? "fail" : ""}>
          <span className="dot" />
          <span>{check.label}</span>
          <span className="detail">{check.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function Capture() {
  const state = useCapture();
  return (
    <div id="view-capture" onPointerDown={state.resume}>
      <Breadcrumb current="New recording" />
      <Panel title="1 — Signal">
        <div className="field">
          <label htmlFor="cap-device">Microphone</label>
          <div className="row">
            <select
              id="cap-device"
              style={{ flex: 1 }}
              value={state.deviceId}
              disabled={state.recording || state.starting || state.saving}
              onChange={(event) => void state.openDevice(event.target.value)}
            >
              <option value="">Default microphone</option>
              {state.devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
            <Button
              onClick={() => void state.refreshDevices()}
              title="Re-scan"
              disabled={state.recording || state.starting || state.saving}
            >
              ↻
            </Button>
          </div>
        </div>
        <label>Raw-audio status (all should be OFF)</label>
        <div className="badges">
          {state.dsp.map((check) => (
            <span key={check.name} className={`badge ${check.off ? "ok" : "bad"}`}>
              {check.name}: {check.off ? "OFF ✓" : "ON ✗"}
            </span>
          ))}
          {state.sampleRate > 0 && <span className="badge">{state.sampleRate} Hz</span>}
        </div>
        <label>Input level — keep out of the red</label>
        <div className={`meter ${state.level.peak > 0.98 ? "clip" : ""}`}>
          <div style={{ width: `${Math.min(100, state.level.rms * 400)}%` }} />
        </div>
        <p className="hint">
          {state.level.peak === 0
            ? "Whistle a steady note at your normal volume."
            : state.levelHint}
        </p>
        <div className="field" style={{ marginTop: ".7rem" }}>
          <label htmlFor="cap-gain">
            Input gain — <span>{state.gain.toFixed(1)}×</span>{" "}
            <span className="hint">(doesn't affect pitch accuracy)</span>
          </label>
          <input
            id="cap-gain"
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={state.gain}
            onChange={(event) => state.changeGain(Number(event.target.value))}
          />
        </div>
      </Panel>
      <Panel title="2 — Room noise (required)">
        <div className="row">
          <Button onClick={state.measureRoom}>● Record the room (stay silent ~1.5s)</Button>
          <span className="hint">{state.noiseReadout}</span>
        </div>
        <label style={{ marginTop: ".8rem" }}>Live pitch check</label>
        <canvas className="trace" ref={state.traceRef} />
        <Checklist checks={state.checks} />
      </Panel>
      <Panel title="3 — Tempo & record">
        <div className="row" style={{ marginBottom: ".9rem" }}>
          <div style={{ width: 120 }}>
            <label htmlFor="cap-bpm">Tempo (BPM)</label>
            <input
              id="cap-bpm"
              type="number"
              value={state.bpm}
              onChange={(event) => state.setBpm(Number(event.target.value))}
              min="40"
              max="220"
            />
          </div>
          <div style={{ width: 120 }}>
            <label htmlFor="cap-beats">Beats / bar</label>
            <input
              id="cap-beats"
              type="number"
              value={state.beatsPerBar}
              onChange={(event) => state.setBeatsPerBar(Number(event.target.value))}
              min="1"
              max="12"
            />
          </div>
        </div>
        <div className="beatbox">
          <div
            className={`beatdot ${state.beat.on ? "on" : ""} ${state.beat.accent ? "accent" : ""}`}
          />
          <div className="count">{state.beat.count}</div>
        </div>
        <div className="row">
          <Button
            variant="primary"
            disabled={!state.noiseMeasured || state.starting || state.recording || state.saving}
            onClick={() => void state.startRecording()}
          >
            ● Record
          </Button>
          <Button disabled={!state.recording} onClick={() => void state.stopRecording()}>
            ■ Stop & save
          </Button>
        </div>
        <p className="hint">
          {state.recording
            ? ""
            : state.noiseMeasured
              ? "Ready — set your tempo and hit Record. (Aim for a green signal check above.)"
              : "Record the room (silence) to enable recording."}
        </p>
        <p className="hint">
          A 1-bar count-in plays, then recording starts on the downbeat. The click is removed from
          pitch detection automatically.
        </p>
        <p className="hint">{state.status}</p>
      </Panel>
    </div>
  );
}
