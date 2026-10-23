import { useCallback, useEffect, useRef, useState } from "react";
import { openMic, listInputDevices, type MicHandle } from "../audio";
import { createPitchDetector } from "../pitch";
import { getSoundProfile, type SoundProfile } from "../recording-profiles";
import type { Frame } from "../notes";
import { drawTrace, autoRange } from "../trace";
import { dspStatus, levelHint, peakLevel } from "../capture-model";

export interface Observation {
  t: number;
  frame: Frame;
  peak: number;
  samples: Float32Array;
}
interface Options {
  isBusy(): boolean;
  onError(message: string): void;
  onBeforeClose(): void;
}
interface MonitorGrid {
  bpm: number;
  beatsPerBar: number;
  origin: number;
}
export function useMicrophone({ isBusy, onError, onBeforeClose }: Options) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState({
    id: "",
    gain: 1,
    dsp: [] as ReturnType<typeof dspStatus>,
    sampleRate: 0,
    opening: false,
  });
  const [level, setLevel] = useState({ rms: 0, peak: 0, freq: null as number | null });
  const owner = useRef({ mic: null as MicHandle | null, generation: 0, mounted: false, gain: 1 });
  const profile = useRef<SoundProfile>(getSoundProfile("whistle"));
  const gate = useRef(0.003);
  const monitor = useRef<MonitorGrid | null>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const listeners = useRef(new Set<(value: Observation) => void>());
  const raf = useRef(0);
  const offEnded = useRef<(() => void) | null>(null);
  const subscribe = (listener: (value: Observation) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  };
  const closeMic = useCallback(() => {
    cancelAnimationFrame(raf.current);
    offEnded.current?.();
    offEnded.current = null;
    onBeforeClose();
    owner.current.mic?.close();
    owner.current.mic = null;
  }, [onBeforeClose]);
  const refreshDevices = async () => {
    try {
      const found = await listInputDevices();
      if (owner.current.mounted) setDevices(found);
    } catch {
      /* Device labels may be unavailable before permission. */
    }
  };
  const openDevice = async (id: string) => {
    if (isBusy()) return;
    const current = ++owner.current.generation;
    closeMic();
    setDevice((previous) => ({ ...previous, id, dsp: [], sampleRate: 0, opening: true }));
    setLevel({ rms: 0, peak: 0, freq: null });
    onError("");
    try {
      const opened = await openMic({
        ...(id ? { deviceId: id } : {}),
        fftSize: profile.current.analysis.windowSize,
      });
      if (!owner.current.mounted || current !== owner.current.generation) {
        opened.close();
        return;
      }
      owner.current.mic = opened;
      opened.setGain(owner.current.gain);
      setDevice((previous) => ({
        ...previous,
        dsp: dspStatus(opened.getSettings()),
        sampleRate: opened.sampleRate,
        opening: false,
      }));
      if (opened.onEnded)
        offEnded.current = opened.onEnded(() => {
          if (owner.current.mic !== opened) return;
          owner.current.generation++;
          closeMic();
          setDevice((previous) => ({ ...previous, dsp: [], sampleRate: 0, opening: false }));
          setLevel({ rms: 0, peak: 0, freq: null });
          onError("Microphone disconnected — reconnect to continue.");
        });
      void refreshDevices();
      const detect = createPitchDetector(opened.sampleRate, profile.current.analysis);
      const frames: Frame[] = [];
      let lastUpdate = -Infinity;
      const loop = () => {
        if (owner.current.mic !== opened) return;
        raf.current = requestAnimationFrame(loop);
        const t = opened.context.currentTime;
        const samples = opened.readFrame();
        const detected = detect(samples);
        const frame: Frame = {
          t,
          ...detected,
          freq: detected.rms >= gate.current ? detected.freq : null,
        };
        const peak = peakLevel(samples);
        for (const listener of listeners.current) listener({ t, samples, frame, peak });
        frames.push(frame);
        while (frames.length && frames[0]!.t < t - 6) frames.shift();
        // Bound retained data even if the context is suspended while RAF keeps firing.
        if (frames.length > 500) frames.splice(0, frames.length - 500);
        if (t - lastUpdate >= 0.1 || lastUpdate === -Infinity) {
          lastUpdate = t;
          setLevel({ rms: detected.rms, peak, freq: frame.freq });
        }
        if (traceRef.current)
          drawTrace(traceRef.current, frames, {
            tMin: t - 5,
            tMax: t + 0.2,
            ...autoRange(frames),
            playheadTime: t,
            ...(monitor.current
              ? { beats: monitor.current, beatOrigin: monitor.current.origin }
              : {}),
          });
      };
      loop();
    } catch (error) {
      if (owner.current.mounted && current === owner.current.generation) {
        setDevice((previous) => ({ ...previous, opening: false }));
        onError(`Mic error: ${(error as Error).message}`);
      }
    }
  };
  useEffect(() => {
    owner.current.mounted = true;
    return () => {
      owner.current.mounted = false;
      owner.current.generation++;
      closeMic();
    };
  }, [closeMic]);
  const changeGain = (value: number) => {
    if (isBusy() || !Number.isFinite(value)) return;
    const gain = Math.max(1, Math.min(20, value));
    owner.current.gain = gain;
    setDevice((previous) => ({ ...previous, gain }));
    owner.current.mic?.setGain(gain);
  };
  const currentMic = useCallback(() => owner.current.mic, []);
  const isCurrentMic = (handle: MicHandle) => owner.current.mounted && owner.current.mic === handle;
  const isRunning = () => owner.current.mic?.context.state === "running";
  const resume = () => {
    void owner.current.mic?.context.resume().catch(() => {});
  };
  return {
    devices,
    deviceId: device.id,
    gain: device.gain,
    dsp: device.dsp,
    sampleRate: device.sampleRate,
    opening: device.opening,
    level,
    levelHint: levelHint(level.peak),
    traceRef,
    monitor,
    profile,
    gate,
    subscribe,
    isRunning,
    currentMic,
    isCurrentMic,
    refreshDevices,
    openDevice,
    changeGain,
    resume,
  };
}
