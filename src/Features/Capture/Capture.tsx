import { useStudioMode } from "../../Studio/useStudioMode";
import { Toast } from "../../UI/Toast";
import { Link } from "react-router";
import { useCapture } from "./useCapture";
import { validTempo } from "../../Recording/RecordingSetup";
import { useCaptureWizard } from "./useCaptureWizard";
import { LiveMonitor } from "./LiveMonitor";
import { CaptureControls } from "./CaptureControls";
import { CaptureSteps } from "./CaptureSteps";

export function Capture() {
  const state = useCapture();
  const { embedded } = useStudioMode();
  const locked = state.starting || state.recording || state.saving;
  const wizard = useCaptureWizard(state.setup, locked, state.tempo.stop);
  const mode =
    state.measuring ?? (state.tempo.listening ? "clap" : state.recording ? "recording" : "listen");
  const microphone = state.devices.find((device) => device.deviceId === state.deviceId);
  return (
    <div id="view-capture" data-recording={state.recording} onPointerDown={state.resume}>
      {!embedded && (
        <Link className="capture-library-fallback" to="/">
          Library
        </Link>
      )}
      <div className="capture-layout">
        <div className="capture-monitor">
          <LiveMonitor
            embedded={embedded}
            level={state.level}
            traceRef={state.traceRef}
            mode={mode}
            bpm={validTempo(state.setup.bpm, state.setup.beatsPerBar) ? state.setup.bpm : null}
            beatsPerBar={state.setup.beatsPerBar}
            confirmed={state.setup.tempoConfirmed}
            connected={state.sampleRate > 0}
            transport={state.transport ?? state.tempo.transport}
            clock={state.currentMic()?.context ?? null}
            preferredRange={state.analysis.preferredRange}
          />
        </div>
        <section className="capture-wizard" aria-label="Recording setup">
          <div className="capture-wizard-content">
            <CaptureSteps
              setup={state.setup}
              active={wizard.active.id}
              nextIndex={wizard.nextIndex}
              locked={locked}
              recording={state.recording}
              microphone={microphone?.label || "Default"}
              onChoose={wizard.chooseStep}
            />
            <p role="status" className="sr-only">
              {state.status}
            </p>
            <div className="setup-step">
              <h2 className="sr-only capture-step-title" ref={wizard.heading} tabIndex={-1}>
                {wizard.active.title}
              </h2>
              <fieldset
                disabled={locked && wizard.active.id !== "record"}
                className="setup-controls"
              >
                <CaptureControls
                  step={wizard.active.id}
                  state={state}
                  advance={wizard.advance}
                  back={wizard.back}
                />
              </fieldset>
            </div>
          </div>
        </section>
      </div>
      <Toast
        notice={state.notice}
        onDismiss={state.dismissNotice}
        label={state.notice?.kind === "error" ? "Recording error" : "Recording saved"}
      />
    </div>
  );
}
