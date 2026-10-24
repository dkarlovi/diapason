import { useCallback, useEffect, useRef, useState } from "react";
import { useMicrophone } from "./useMicrophone";
import { useMeasurements } from "./useMeasurements";
import { useTempo } from "./useTempo";
import { setupCheck } from "../capture-model";
import { getSoundProfile } from "../recording-profiles";
import type { TransportState } from "../metronome";
import {
  canRecord,
  initialSetup,
  setupReducer,
  validTempo,
  type SetupAction,
} from "../recording-setup";
export function useRecordingSetup({
  isBusy,
  onBeforeClose,
  transport,
  setStatus,
}: {
  isBusy(): boolean;
  onBeforeClose(): void;
  transport: TransportState | null;
  setStatus(message: string): void;
}) {
  const [setup, setSetup] = useState(initialSetup);
  const setupRef = useRef(setup);
  const update = useCallback((action: SetupAction) => {
    const next = setupReducer(setupRef.current, action);
    setupRef.current = next;
    setSetup(next);
    return next;
  }, []);
  const [acknowledged, setAcknowledged] = useState(false);
  const busy = {
    get current() {
      return isBusy();
    },
  };
  const microphone = useMicrophone({ isBusy, onError: setStatus, onBeforeClose });
  const { currentMic, isCurrentMic } = microphone;
  const measurements = useMeasurements(microphone.subscribe, microphone.isRunning, currentMic);
  const changeTempo = useCallback(
    (bpm: number, beatsPerBar: number) => {
      if (!busy.current) update({ type: "tempo", bpm, beatsPerBar });
    },
    [update],
  );
  const confirmTempo = useCallback(() => {
    if (!busy.current) update({ type: "tempo-confirm" });
  }, [update]);
  const tempo = useTempo({
    bpm: setup.bpm,
    beatsPerBar: setup.beatsPerBar,
    floor: setup.room?.floor ?? 0.001,
    currentMic,
    onChange: changeTempo,
    onConfirm: confirmTempo,
  });
  useEffect(() => {
    microphone.profile.current = getSoundProfile(setup.profileId);
    microphone.gate.current = setup.room?.gate ?? 0.003;
  }, [microphone.profile, microphone.gate, setup.profileId, setup.room]);
  useEffect(() => {
    const clock = transport ?? tempo.transport;
    microphone.monitor.current = validTempo(setup.bpm, setup.beatsPerBar)
      ? {
          bpm: clock?.bpm ?? setup.bpm,
          beatsPerBar: clock?.beatsPerBar ?? setup.beatsPerBar,
          origin: clock?.downbeatTime ?? currentMic()?.context.currentTime ?? 0,
          showTimeLabels: transport !== null && transport.running,
        }
      : null;
  }, [
    currentMic,
    microphone.monitor,
    setup.bpm,
    setup.beatsPerBar,
    microphone.sampleRate,
    transport,
    tempo.transport,
  ]);

  const openDevice = async (id: string) => {
    if (busy.current || !setupRef.current.soundConfirmed) return;
    measurements.cancel();
    tempo.stop();
    setAcknowledged(false);
    update({ type: "device", id });
    await microphone.openDevice(id);
  };
  const changeGain = (value: number) => {
    if (busy.current || !Number.isFinite(value)) return;
    const gain = Math.max(1, Math.min(20, value));
    if (setupRef.current.gain === gain) return;
    measurements.cancel();
    tempo.stop();
    microphone.changeGain(gain);
    update({ type: "gain", value: gain });
    setStatus("");
  };
  const micChecks = microphone.dsp.map((check) =>
    setupCheck(
      check.name,
      (
        {
          echoCancellation: "Echo cancellation disabled",
          noiseSuppression: "Noise suppression disabled",
          autoGainControl: "Automatic gain disabled",
        } as Record<string, string>
      )[check.name]!,
      check.off || (!check.known && acknowledged),
      check.known
        ? check.off
          ? "Verified"
          : "Enabled — retry or choose another microphone"
        : "Unknown — browser does not report this setting",
    ),
  );
  const micCanConfirm =
    microphone.sampleRate > 0 &&
    micChecks.length === 3 &&
    micChecks.every((check) => check.status === "passed");
  const confirmMicrophone = () => {
    if (micCanConfirm) update({ type: "microphone", ready: true });
  };
  const chooseSound = (id: string) => {
    if (busy.current) return;
    const profile = getSoundProfile(id);
    if (profile.id !== setupRef.current.profileId) {
      measurements.cancel();
      tempo.stop();
    }
    update({ type: "source", id: profile.id });
    if (!currentMic() && !microphone.opening) void openDevice(setupRef.current.deviceId);
  };
  const runMeasurement = async (kind: "room" | "sound") => {
    const opened = currentMic(),
      current = setupRef.current;
    if (!opened || busy.current || (kind === "room" ? !current.micReady : !current.room?.pass))
      return;
    measurements.cancel();
    tempo.stop();
    setStatus("");
    const revision = update({ type: kind === "room" ? "room-start" : "sound-start" }).revision;
    try {
      await opened.context.resume();
      if (!isCurrentMic(opened) || setupRef.current.revision !== revision) return;
      if (kind === "room")
        measurements.startRoom((result) => update({ type: "room-result", revision, result }));
      else
        measurements.startSound(current.room!.floor, getSoundProfile(current.profileId), (result) =>
          update({ type: "sound-result", revision, result }),
        );
    } catch (error) {
      if (isCurrentMic(opened) && setupRef.current.revision === revision) {
        update({ type: "cancel" });
        setStatus(`Measurement error: ${(error as Error).message}`);
      }
    }
  };
  const measureRoom = () => runMeasurement("room");
  const checkSound = () => runMeasurement("sound");

  const onClose = useCallback(() => {
    measurements.cancel();
    tempo.stop();
    setAcknowledged(false);
    update({ type: "busy", value: false });
    update({ type: "microphone", ready: false });
  }, [measurements.cancel, tempo.stop, update]);
  return {
    ...microphone,
    microphone,
    measurements,
    setup,
    setupRef,
    update,
    profile: getSoundProfile(setup.profileId),
    chooseSound,
    openDevice,
    changeGain,
    acknowledged,
    setAcknowledged: (value: boolean) => {
      setAcknowledged(value);
      if (!value && microphone.dsp.some((check) => !check.known)) {
        measurements.cancel();
        tempo.stop();
        update({ type: "microphone", ready: false });
      }
    },
    micChecks,
    micCanConfirm,
    confirmMicrophone,
    measureRoom,
    checkSound,
    measuring: setup.measuring,
    tempo,
    onClose,
    ready: canRecord(setup) && !tempo.listening && !tempo.pending,
  };
}
