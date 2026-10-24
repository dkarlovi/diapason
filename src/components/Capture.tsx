import { Link } from "react-router";
import { useCapture } from "../hooks/useCapture";
import { validTempo } from "../recording-setup";
import { useCaptureWizard } from "../hooks/useCaptureWizard";
import { LiveMonitor } from "./LiveMonitor";
import { CaptureControls } from "./CaptureControls";
import { CaptureSteps } from "./CaptureSteps";

export function Capture() {
  const state = useCapture();
  const locked = state.starting || state.recording || state.saving;
  const wizard = useCaptureWizard(state.setup, locked, state.tempo.stop);
  const mode =
    state.measuring ?? (state.tempo.listening ? "clap" : state.recording ? "recording" : "listen");
  const microphone = state.devices.find((device) => device.deviceId === state.deviceId);
  return (
    <div id="view-capture" data-recording={state.recording} onPointerDown={state.resume}>
      <Link className="capture-library-fallback" to="/">
        Library
      </Link>
      <div className="capture-layout">
        <div className="capture-monitor">
          <LiveMonitor
            level={state.level}
            traceRef={state.traceRef}
            mode={mode}
            bpm={validTempo(state.setup.bpm, state.setup.beatsPerBar) ? state.setup.bpm : null}
            beatsPerBar={state.setup.beatsPerBar}
            confirmed={state.setup.tempoConfirmed}
            connected={state.sampleRate > 0}
            transport={state.transport ?? state.tempo.transport}
            clock={state.currentMic()?.context ?? null}
          />
        </div>
        <section className="capture-wizard" aria-label="Recording setup">
          <CaptureSteps
            setup={state.setup}
            active={wizard.active.id}
            nextIndex={wizard.nextIndex}
            locked={locked}
            microphone={microphone?.label || "Default"}
            onChoose={wizard.chooseStep}
          />
          <p role="status" className="capture-status">
            {state.status}
          </p>
          <div className="setup-step">
            <h2 className="sr-only" ref={wizard.heading} tabIndex={-1}>
              {wizard.active.title}
            </h2>
            <fieldset disabled={locked && wizard.active.id !== "record"} className="setup-controls">
              <CaptureControls
                step={wizard.active.id}
                state={state}
                advance={wizard.advance}
                back={wizard.back}
              />
            </fieldset>
          </div>
        </section>
      </div>
    </div>
  );
}
