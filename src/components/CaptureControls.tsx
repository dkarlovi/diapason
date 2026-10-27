import { useState } from "react";
import type { useCapture } from "../hooks/useCapture";
import type { SetupStep } from "../recording-setup";
import { SOUND_PROFILES } from "../recording-profiles";
import { Button, Field } from "./primitives";
import { CaptureActions } from "./CaptureActions";
import { StatusChecklist } from "./StatusChecklist";
import { TempoSetup } from "./TempoSetup";
import { VoiceSoundCheck } from "./VoiceSoundCheck";

type CaptureState = ReturnType<typeof useCapture>;
interface ControlProps {
  state: CaptureState;
  advance: (action: () => void) => void;
  back: (() => void) | undefined;
}

function SoundChoice({ state, advance, back }: ControlProps) {
  const [source, setSource] = useState(state.profile.id);
  const profiles = SOUND_PROFILES.filter(
    (profile) => import.meta.env.DEV || profile.id === "whistle",
  );
  const selected = profiles.find((profile) => profile.id === source) ?? profiles[0]!;
  return (
    <>
      <div className="capture-step-body">
        <Field label="What will you record?" htmlFor="cap-source">
          <select
            id="cap-source"
            value={selected.id}
            onChange={(event) => setSource(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <CaptureActions back={back}>
        <Button variant="primary" onClick={() => advance(() => state.chooseSound(selected.id))}>
          {selected.id === "whistle"
            ? "Continue with whistling"
            : "Continue with singing / humming"}
        </Button>
      </CaptureActions>
    </>
  );
}

function InputGain({ state }: { state: CaptureState }) {
  return (
    <Field label={"Input gain — " + state.gain.toFixed(1) + "×"} htmlFor="cap-gain">
      <input
        id="cap-gain"
        type="range"
        min="1"
        max="20"
        step="0.5"
        value={state.gain}
        disabled={!!state.measuring}
        onChange={(event) => state.changeGain(Number(event.target.value))}
      />
    </Field>
  );
}

function MicrophoneSetup({ state, advance, back }: ControlProps) {
  const connected = state.sampleRate > 0;
  return (
    <>
      <div className="capture-step-body">
        {connected && (
          <>
            <Field label="Microphone" htmlFor="cap-device">
              <select
                id="cap-device"
                value={state.deviceId}
                onChange={(event) => void state.openDevice(event.target.value)}
              >
                <option value="">Default microphone</option>
                {state.devices.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || "Microphone " + (index + 1)}
                  </option>
                ))}
              </select>
            </Field>
            <InputGain state={state} />
            <div className="row device-actions">
              <Button onClick={() => void state.refreshDevices()}>Rescan microphones</Button>
              <Button onClick={() => void state.openDevice(state.deviceId)}>
                Reconnect microphone
              </Button>
            </div>
            <StatusChecklist checks={state.micChecks} />
            {state.dsp.some((check) => !check.known) && (
              <label className="acknowledgment">
                <input
                  type="checkbox"
                  checked={state.acknowledged}
                  onChange={(event) => state.setAcknowledged(event.target.checked)}
                />
                Continue with unverified audio settings
              </label>
            )}
          </>
        )}
      </div>
      <CaptureActions back={back}>
        {connected ? (
          <Button
            variant="primary"
            disabled={!state.micCanConfirm}
            onClick={() => advance(state.confirmMicrophone)}
          >
            Confirm microphone
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={state.opening}
            onClick={() => void state.openDevice(state.deviceId)}
          >
            {state.opening ? "Connecting…" : "Connect microphone"}
          </Button>
        )}
      </CaptureActions>
    </>
  );
}

function RecordControls({ state, back }: Pick<ControlProps, "state" | "back">) {
  return (
    <>
      <div className="capture-step-body record-facts">
        <div>
          <span>Tempo</span>
          <strong>{state.setup.bpm} BPM</strong>
        </div>
        <div>
          <span>Meter</span>
          <strong>{state.setup.beatsPerBar} beats/bar</strong>
        </div>
        <div>
          <span>Count-in</span>
          <strong>1 bar</strong>
        </div>
      </div>
      <CaptureActions back={back} recording={state.recording}>
        <Button
          variant="primary"
          className="record-toggle"
          aria-pressed={state.recording}
          aria-label={state.recording ? "Stop recording" : undefined}
          disabled={state.starting || state.saving || (!state.recording && !state.ready)}
          onClick={() => void (state.recording ? state.stopRecording() : state.startRecording())}
        >
          <span className={state.recording ? "stop-symbol" : "record-symbol"} aria-hidden="true" />
          {state.recording ? "Stop" : state.saving ? "Saving…" : "Record"}
        </Button>
      </CaptureActions>
    </>
  );
}

const ACOUSTIC = {
  room: {
    instruction: "Stay quiet during measurement.",
    label: "Measure room noise",
    pending: "Measuring… stay silent",
    action: "measureRoom",
  },
  sound: {
    instruction: "Whistle a steady note.",
    label: "Check my sound",
    pending: "Checking… keep sounding",
    action: "checkSound",
  },
} as const;
function AcousticSetup({
  state,
  kind,
  back,
}: {
  state: CaptureState;
  kind: keyof typeof ACOUSTIC;
  back: (() => void) | undefined;
}) {
  const config = ACOUSTIC[kind];
  return (
    <>
      <div className="capture-step-body">
        <p className="setup-instruction">
          {kind === "sound" ? state.profile.instruction : config.instruction}
        </p>
        {kind === "room" && <InputGain state={state} />}
        {state.measuring && (
          <progress
            className="measurement-progress"
            aria-label={config.pending}
            value={state.measurements.progress}
            max={1}
          />
        )}
        <StatusChecklist checks={state.setup[kind]?.checks ?? []} />
      </div>
      <CaptureActions back={back}>
        <Button
          variant="primary"
          disabled={!!state.measuring}
          onClick={() => void state[config.action]()}
        >
          {state.measuring ? config.pending : config.label}
        </Button>
      </CaptureActions>
    </>
  );
}

export function CaptureControls({
  step,
  state,
  advance,
  back,
}: ControlProps & { step: SetupStep }) {
  switch (step) {
    case "sound":
      return <SoundChoice state={state} advance={advance} back={back} />;
    case "microphone":
      return <MicrophoneSetup state={state} advance={advance} back={back} />;
    case "room":
      return <AcousticSetup state={state} kind="room" back={back} />;
    case "sound-check":
      return state.profile.id === "whistle" ? (
        <AcousticSetup state={state} kind="sound" back={back} />
      ) : (
        <VoiceSoundCheck state={state} back={back} onContinue={() => advance(() => {})} />
      );
    case "tempo":
      return (
        <TempoSetup
          tempo={state.tempo}
          bpm={state.setup.bpm}
          beatsPerBar={state.setup.beatsPerBar}
          back={back}
        />
      );
    case "record":
      return <RecordControls state={state} back={back} />;
  }
}
