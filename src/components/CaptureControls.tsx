import type { useCapture } from "../hooks/useCapture";
import type { SetupStep } from "../recording-setup";
import { SOUND_PROFILES } from "../recording-profiles";
import { Button } from "./primitives";
import { MeasurementControl, StatusChecklist } from "./StatusChecklist";
import { TempoSetup } from "./TempoSetup";
type CaptureState = ReturnType<typeof useCapture>;
type Advance = (action: () => void) => void;

function SoundChoice({ state, advance }: { state: CaptureState; advance: Advance }) {
  return (
    <>
      <label htmlFor="cap-source">What will you record?</label>
      <select id="cap-source" defaultValue={state.profile.id}>
        {SOUND_PROFILES.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.label}
          </option>
        ))}
      </select>
      <p className="hint">Whistling is supported now. Humming and instruments are planned.</p>
      <Button variant="primary" onClick={() => advance(() => state.chooseSound("whistle"))}>
        Continue with whistling
      </Button>
    </>
  );
}

function MicrophoneSetup({ state, advance }: { state: CaptureState; advance: Advance }) {
  return (
    <>
      {state.sampleRate === 0 ? (
        <Button
          variant="primary"
          disabled={state.opening}
          onClick={() => void state.openDevice(state.deviceId)}
        >
          {state.opening ? "Connecting…" : "Connect microphone"}
        </Button>
      ) : (
        <>
          <label htmlFor="cap-device">Microphone</label>
          <div className="row">
            <select
              id="cap-device"
              value={state.deviceId}
              onChange={(event) => void state.openDevice(event.target.value)}
            >
              <option value="">Default microphone</option>
              {state.devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
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
              />{" "}
              Continue with unverified audio settings
            </label>
          )}
          <Button
            variant="primary"
            disabled={!state.micCanConfirm}
            onClick={() => advance(state.confirmMicrophone)}
          >
            Confirm microphone
          </Button>
        </>
      )}
    </>
  );
}

function RecordControls({ state }: { state: CaptureState }) {
  return (
    <>
      <p>
        {state.profile.label} · {state.setup.bpm} BPM · {state.setup.beatsPerBar} beats/bar
      </p>
      <p className="hint">
        One bar counts you in; recording starts on the downbeat. Stop when you finish.
      </p>
      <p className="count">{state.beat}</p>
      <div className="row">
        <Button
          variant="primary"
          disabled={!state.ready || state.starting || state.recording || state.saving}
          onClick={() => void state.startRecording()}
        >
          Record
        </Button>
        <Button
          disabled={!state.recording || state.starting}
          onClick={() => void state.stopRecording()}
        >
          Stop & save
        </Button>
      </div>
      {state.saving && <p>Saving recording…</p>}
    </>
  );
}

function AcousticSetup({ state, room }: { state: CaptureState; room: boolean }) {
  return (
    <>
      <p>
        {room
          ? "Stay silent for about 1.5 seconds while we measure the background noise."
          : state.profile.instruction}
      </p>
      <MeasurementControl
        label={room ? "Measure room noise" : "Check my sound"}
        pendingLabel={room ? "Measuring… stay silent" : "Checking… keep sounding"}
        pending={!!state.measuring}
        checks={(room ? state.setup.room : state.setup.sound)?.checks ?? []}
        onStart={() => void (room ? state.measureRoom() : state.checkSound())}
      />
    </>
  );
}
export function CaptureControls({
  step,
  state,
  advance,
}: {
  step: SetupStep;
  state: CaptureState;
  advance: Advance;
}) {
  switch (step) {
    case "sound":
      return <SoundChoice state={state} advance={advance} />;
    case "microphone":
      return <MicrophoneSetup state={state} advance={advance} />;
    case "room":
      return <AcousticSetup state={state} room />;
    case "sound-check":
      return <AcousticSetup state={state} room={false} />;
    case "tempo":
      return (
        <TempoSetup
          tempo={state.tempo}
          bpm={state.setup.bpm}
          beatsPerBar={state.setup.beatsPerBar}
        />
      );
    case "record":
      return <RecordControls state={state} />;
  }
}
