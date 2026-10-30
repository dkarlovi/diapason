import { useTempoEstimate } from "./useTempoEstimate";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MicHandle } from "../../Audio/Audio";
import { openClapListener } from "../../Audio/ClapListening";
import { adjustTempo } from "./Tempo.model";
import { validTempo } from "../../Recording/RecordingSetup";
import { startMetronome, type MetronomeHandle, type TransportState } from "../../Audio/Metronome";
interface Options {
  bpm: number;
  beatsPerBar: number;
  floor: number;
  currentMic(): MicHandle | null;
  onChange(bpm: number, beatsPerBar: number): void;
  onConfirm(): void;
  onError(message: string): void;
}
export function useTempo(options: Options) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  }, [options]);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const { estimate, detected, addEvent, resetEstimate } = useTempoEstimate(
    (bpm) => latest.current.onChange(bpm, latest.current.beatsPerBar),
    setMessage,
  );
  const [transport, setTransport] = useState<TransportState | null>(null);
  const resources = useRef({
    token: 0,
    cleanup: null as (() => void) | null,
    metro: null as MetronomeHandle | null,
  });
  const release = useCallback(() => {
    resources.current.token++;
    resources.current.cleanup?.();
    resources.current.cleanup = null;
    resources.current.metro?.stop();
    resources.current.metro = null;
  }, []);
  const stop = useCallback(() => {
    release();
    setListening(false);
    setPending(false);
    setTransport(null);
  }, [release]);
  useEffect(() => () => release(), [release]);
  const tap = useCallback(() => {
    stop();
    addEvent(performance.now() / 1000);
  }, [addEvent, stop]);
  const reset = useCallback(() => {
    stop();
    resetEstimate();
    setMessage("");
  }, [resetEstimate, stop]);
  const resumeMic = async (mic: MicHandle, current: number) => {
    setPending(true);
    await mic.context.resume();
    return current === resources.current.token && latest.current.currentMic() === mic;
  };
  const startClap = async () => {
    reset();
    latest.current.onError("");
    const mic = latest.current.currentMic();
    if (!mic) {
      setMessage("Connect your microphone first.");
      return;
    }
    const current = resources.current.token;
    try {
      if (!(await resumeMic(mic, current))) return;
      const off = await openClapListener(
        mic,
        latest.current.floor,
        addEvent,
        (message) => {
          stop();
          setMessage(message);
        },
        () => current === resources.current.token,
      );
      if (current !== resources.current.token || latest.current.currentMic() !== mic) {
        off();
        return;
      }
      resources.current.cleanup = off;
      setPending(false);
      setListening(true);
      setMessage("Clap several steady beats.");
    } catch (error) {
      if (current === resources.current.token) {
        stop();
        latest.current.onError(
          `Clap listening unavailable: ${(error as Error).message}. You can tap instead.`,
        );
      }
    }
  };
  const preview = async () => {
    stop();
    latest.current.onError("");
    const mic = latest.current.currentMic();
    const { bpm, beatsPerBar } = latest.current;
    if (!mic || !validTempo(bpm, beatsPerBar)) return;
    const current = resources.current.token;
    try {
      if (!(await resumeMic(mic, current))) return;
      const handle = startMetronome(mic.context, { bpm, beatsPerBar, countInBars: 0 });
      resources.current.metro = handle;
      setPending(false);
      setTransport({
        bpm,
        beatsPerBar,
        downbeatTime: handle.downbeatTime,
        phase: "preview",
        running: true,
      });
    } catch (error) {
      if (current === resources.current.token) {
        stop();
        latest.current.onError(`Preview unavailable: ${(error as Error).message}`);
      }
    }
  };
  const changeBpm = (bpm: number) => {
    reset();
    latest.current.onChange(bpm, latest.current.beatsPerBar);
  };
  const changeMeter = (beats: number) => {
    stop();
    latest.current.onChange(latest.current.bpm, beats);
  };
  const adjust = (factor: 0.5 | 2) => {
    const bpm = adjustTempo(latest.current.bpm, factor);
    if (bpm !== null) {
      stop();
      latest.current.onChange(bpm, latest.current.beatsPerBar);
    }
  };
  const canConfirm =
    validTempo(options.bpm, options.beatsPerBar) && (!detected || estimate.stable) && !pending;
  const confirm = () => {
    if (canConfirm) {
      stop();
      latest.current.onConfirm();
    }
  };
  return {
    listening,
    pending,
    message,
    estimate,
    transport,
    canConfirm,
    tap,
    reset,
    startClap,
    stop,
    preview,
    changeBpm,
    changeMeter,
    adjust,
    confirm,
  };
}
