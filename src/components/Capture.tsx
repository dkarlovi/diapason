import { useEffect, useRef, useState } from "react";
import { useCapture } from "../hooks/useCapture";
import { nextSetupStep, type SetupStep } from "../recording-setup";
import { Breadcrumb, Button } from "./primitives";
import { LiveMonitor } from "./LiveMonitor";
import { CaptureControls } from "./CaptureControls";
const STEPS: { id: SetupStep; title: string }[] = [
  { id: "sound", title: "Choose your sound" },
  { id: "microphone", title: "Set up your microphone" },
  { id: "room", title: "Measure room noise" },
  { id: "sound-check", title: "Check your sound" },
  { id: "tempo", title: "Find your tempo" },
  { id: "record", title: "Record" },
];
export function Capture() {
  const state = useCapture();
  const next = nextSetupStep(state.setup);
  const [editing, setEditing] = useState<SetupStep | null>(null);
  const nextIndex = STEPS.findIndex((step) => step.id === next);
  const editIndex = STEPS.findIndex((step) => step.id === editing);
  const active = editing && editIndex <= nextIndex ? editing : next;
  const heading = useRef<HTMLHeadingElement>(null);
  const previousRevision = useRef(state.setup.revision);
  useEffect(() => {
    if (previousRevision.current !== state.setup.revision) {
      setEditing(null);
      previousRevision.current = state.setup.revision;
    }
  }, [state.setup.revision]);
  useEffect(() => {
    heading.current?.focus();
  }, [active]);
  const locked = state.starting || state.recording || state.saving;
  const mode =
    state.measuring ?? (state.tempo.listening ? "clap" : state.recording ? "recording" : "listen");
  const advance = (action: () => void) => {
    action();
    setEditing(null);
  };
  const summaries: Record<SetupStep, string> = {
    sound: state.profile.label,
    microphone: `${state.sampleRate} Hz · ${state.acknowledged ? "Unreported settings acknowledged" : "Audio settings verified"}`,
    room: "Low room noise · Measurement passed",
    "sound-check": "Sound check passed",
    tempo: `${state.setup.bpm} BPM · ${state.setup.beatsPerBar} beats/bar`,
    record: "Ready",
  };
  return (
    <div id="view-capture" onPointerDown={state.resume}>
      <Breadcrumb current="New recording" />
      <LiveMonitor
        level={state.level}
        traceRef={state.traceRef}
        mode={mode}
        bpm={state.setup.bpm}
        beatsPerBar={state.setup.beatsPerBar}
        confirmed={state.setup.tempoConfirmed}
        connected={state.sampleRate > 0}
        gain={state.gain}
        onGainChange={state.changeGain}
        locked={locked}
      />
      <p role="status">{state.status}</p>
      {STEPS.filter((_, index) => index <= nextIndex).map((step, index) => (
        <section
          key={step.id}
          className={`setup-step ${active === step.id ? "active" : "completed"}`}
        >
          <div className="step-heading">
            <h2 ref={active === step.id ? heading : undefined} tabIndex={-1}>
              {index + 1} — {step.title}
            </h2>
            {active !== step.id && (
              <Button
                disabled={locked}
                aria-label={`Edit ${step.title}`}
                onClick={() => {
                  state.tempo.stop();
                  setEditing(step.id);
                }}
              >
                Edit
              </Button>
            )}
          </div>
          {active !== step.id ? (
            <p className="hint">
              {index < nextIndex ? `✓ ${summaries[step.id]}` : "Not checked yet"}
            </p>
          ) : (
            <fieldset disabled={locked && step.id !== "record"} className="setup-controls">
              <CaptureControls step={step.id} state={state} advance={advance} />
              {editing === step.id && step.id !== "sound" && (
                <Button onClick={() => setEditing(null)}>Done editing</Button>
              )}
            </fieldset>
          )}
        </section>
      ))}
    </div>
  );
}
