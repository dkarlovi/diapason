import type { MicHandle } from "../audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { CALIBRATION, evaluateRoom, evaluateSound } from "../capture-model";
import type { SoundProfile } from "../recording-profiles";
import type { RoomResult } from "../recording-setup";
import type { Observation } from "./useMicrophone";
import { measureVoiceEndpoint, type EndpointResult } from "../voice-range";

/** Bounded tests own their subscriptions/timers; completed results belong to setup. */
export function useMeasurements(
  subscribe: (listener: (value: Observation) => void) => () => void,
  isRunning: () => boolean,
  currentMic?: () => MicHandle | null,
) {
  const cleanup = useRef<(() => void) | null>(null);
  const [measuring, setMeasuring] = useState<"room" | "sound" | null>(null);
  const [progress, setProgress] = useState(0);
  const cancel = useCallback(() => {
    cleanup.current?.();
    cleanup.current = null;
    setMeasuring(null);
    setProgress(0);
  }, []);
  useEffect(
    () => () => {
      cleanup.current?.();
    },
    [],
  );
  const collect = useCallback(
    (kind: "room" | "sound", duration: number, complete: (observations: Observation[]) => void) => {
      cancel();
      const observations: Observation[] = [];
      setMeasuring(kind);
      const started = Date.now();
      const progressTimer = window.setInterval(() => {
        setProgress(Math.min(1, (Date.now() - started) / duration));
      }, 50);
      let valid = true;
      const interrupted = () => {
        if (!isRunning() || document.hidden) valid = false;
      };
      const context = currentMic?.()?.context;
      document.addEventListener("visibilitychange", interrupted);
      context?.addEventListener("statechange", interrupted);
      const off = subscribe((value) => {
        if (!isRunning() || document.hidden) {
          valid = false;
          return;
        }
        // Borrowed PCM is not retained; the tests need only these scalar observations.
        observations.push({ ...value, samples: new Float32Array(0) });
      });
      const timer = window.setTimeout(() => {
        const captured = valid && isRunning() && !document.hidden ? observations : [];
        cancel();
        complete(captured);
      }, duration);
      cleanup.current = () => {
        window.clearTimeout(timer);
        window.clearInterval(progressTimer);
        off();
        document.removeEventListener("visibilitychange", interrupted);
        context?.removeEventListener("statechange", interrupted);
      };
    },
    [cancel, currentMic, isRunning, subscribe],
  );
  const startRoom = useCallback(
    (complete: (result: RoomResult) => void) =>
      collect("room", CALIBRATION.roomMs, (observations) =>
        complete(
          evaluateRoom(
            observations.map((value) => ({ t: value.t, rms: value.frame.rms, peak: value.peak })),
          ),
        ),
      ),
    [collect],
  );
  const startSound = useCallback(
    (
      floor: number,
      profile: SoundProfile,
      complete: (result: EndpointResult) => void,
      endpoint = false,
    ) =>
      collect("sound", CALIBRATION.soundMs, (observations) =>
        complete({
          frequency: null,
          ...(endpoint ? measureVoiceEndpoint : evaluateSound)(
            observations.map((value) => value.frame),
            observations.reduce((peak, value) => Math.max(peak, value.peak), 0),
            floor,
            profile,
          ),
        }),
      ),
    [collect],
  );
  return { measuring, progress, startRoom, startSound, cancel };
}
