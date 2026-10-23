import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { openMic, listInputDevices, type MicHandle } from "../audio";
import { createPitchDetector } from "../pitch";
import type { Frame } from "../notes";
import { drawTrace, autoRange } from "../trace";
import { qualityStats } from "../recorder";
import { checksFor, type Check } from "../ui";
import { dspStatus, levelHint, noiseCalibration, peakLevel } from "../capture-model";

const LIVE_WINDOW_SEC = 5;
interface Options {
  isBusy(): boolean;
  onError(message: string): void;
  /** The capture owner releases its recorder/metronome before the mic closes. */
  onBeforeClose(): void;
}

export function useMicrophone({ isBusy, onError, onBeforeClose }: Options) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState({
    id: "",
    gain: 1,
    dsp: [] as { name: string; off: boolean }[],
    sampleRate: 0,
  });

  const mic = useRef<MicHandle | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const gainRef = useRef(device.gain);
  const { noiseReadout, noiseMeasured, rmsGate, recordRms, resetCalibration, measureRoom } =
    useRoomCalibration(mic);

  const { level, checks, traceRef, startMonitor, stopMonitor } = useLiveTrace(rmsGate, recordRms);

  const closeMic = useCallback(() => {
    stopMonitor();
    onBeforeClose();
    mic.current?.close();
    mic.current = null;
  }, [onBeforeClose, stopMonitor]);

  const refreshDevices = useCallback(async () => {
    try {
      const found = await listInputDevices();
      if (mounted.current) setDevices(found);
    } catch {
      // Device labels can be unavailable before permission is granted.
    }
  }, []);

  const openDevice = useCallback(
    async (id: string) => {
      if (isBusy()) return;
      const current = ++generation.current;
      resetCalibration();
      closeMic();
      setDevice((previous) => ({ ...previous, id }));
      onError("");
      try {
        const opened = await openMic(id ? { deviceId: id } : {});
        if (!mounted.current || current !== generation.current) {
          opened.close();
          return;
        }
        mic.current = opened;
        opened.setGain(gainRef.current);
        const startedAt = performance.now();
        setDevice((previous) => ({
          ...previous,
          dsp: dspStatus(opened.getSettings()),
          sampleRate: opened.sampleRate,
        }));
        await refreshDevices();
        if (mounted.current && current === generation.current) startMonitor(opened, startedAt);
      } catch (error) {
        if (mounted.current && current === generation.current)
          onError(`Mic error: ${(error as Error).message}`);
      }
    },
    [closeMic, startMonitor, refreshDevices, isBusy, onError, resetCalibration],
  );

  useEffect(() => {
    mounted.current = true;
    void openDevice("");
    return () => {
      mounted.current = false;
      generation.current++;
      closeMic();
    };
  }, [closeMic, openDevice]);

  const changeGain = useCallback((value: number) => {
    gainRef.current = value;
    setDevice((previous) => ({ ...previous, gain: value }));
    mic.current?.setGain(value);
  }, []);

  const microphoneAccess = useMemo(
    () => ({
      resume: () => {
        void mic.current?.context.resume();
      },
      currentMic: () => mic.current,
      isCurrentMic: (handle: MicHandle) => mounted.current && mic.current === handle,
      captureSettings: () => ({ gain: gainRef.current, noiseFloor: rmsGate.current }),
    }),
    [rmsGate],
  );

  return {
    devices,
    deviceId: device.id,
    gain: device.gain,
    dsp: device.dsp,
    sampleRate: device.sampleRate,
    level,
    levelHint: levelHint(level.peak),
    checks,
    noiseReadout,
    noiseMeasured,
    traceRef,
    refreshDevices,
    openDevice,
    changeGain,
    measureRoom,
    ...microphoneAccess,
  };
}

/** Room calibration owns its timer and accumulated measurements. */
function useRoomCalibration(mic: RefObject<MicHandle | null>) {
  const [noiseReadout, setNoiseReadout] = useState("not measured yet");
  const [noiseMeasured, setNoiseMeasured] = useState(false);
  const rmsGate = useRef(0.003);
  const measuring = useRef(false);
  const noiseSamples = useRef<number[]>([]);
  const noiseTimer = useRef(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(noiseTimer.current);
    };
  }, []);
  const resetCalibration = useCallback(() => {
    window.clearTimeout(noiseTimer.current);
    measuring.current = false;
    noiseSamples.current = [];
    rmsGate.current = 0.003;
    setNoiseMeasured(false);
    setNoiseReadout("not measured yet");
  }, []);
  const recordRms = useCallback((rms: number) => {
    if (measuring.current) noiseSamples.current.push(rms);
  }, []);
  const measureRoom = useCallback(() => {
    if (measuring.current || !mic.current) return;
    void mic.current.context.resume();
    measuring.current = true;
    noiseSamples.current = [];
    setNoiseReadout("measuring… stay silent");
    noiseTimer.current = window.setTimeout(() => {
      if (!mounted.current) return;
      measuring.current = false;
      const { floor, gate } = noiseCalibration(noiseSamples.current);
      rmsGate.current = gate;
      setNoiseReadout(`floor ${floor.toFixed(4)} · gate ${gate.toFixed(4)} ✓`);
      setNoiseMeasured(true);
    }, 1500);
  }, [mic]);

  return { noiseReadout, noiseMeasured, rmsGate, recordRms, resetCalibration, measureRoom };
}

/** One live sample loop; stopping invalidates callbacks as well as cancelling RAF. */
function useLiveTrace(rmsGate: RefObject<number>, recordRms: (rms: number) => void) {
  const [level, setLevel] = useState({ rms: 0, peak: 0 });
  const [checks, setChecks] = useState<Check[]>([]);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const active = useRef<MicHandle | null>(null);
  const raf = useRef(0);
  const lastVerdict = useRef(0);
  const stopMonitor = useCallback(() => {
    active.current = null;
    cancelAnimationFrame(raf.current);
  }, []);
  const startMonitor = useCallback(
    (opened: MicHandle, startedAt: number) => {
      stopMonitor();
      active.current = opened;
      const detect = createPitchDetector(opened.sampleRate);
      const frames: Frame[] = [];
      const loop = () => {
        if (active.current !== opened) return;
        raf.current = requestAnimationFrame(loop);
        const t = (performance.now() - startedAt) / 1000;
        const buf = opened.readFrame();
        const { freq, clarity, rms } = detect(buf);
        setLevel({ rms, peak: peakLevel(buf) });
        recordRms(rms);
        frames.push({
          t,
          freq: freq !== null && rms >= rmsGate.current ? freq : null,
          clarity,
          rms,
        });
        while (frames.length && frames[0]!.t < t - (LIVE_WINDOW_SEC + 1)) frames.shift();
        if (traceRef.current)
          drawTrace(traceRef.current, frames, {
            tMin: t - LIVE_WINDOW_SEC,
            tMax: t,
            ...autoRange(frames),
          });
        if (performance.now() - lastVerdict.current > 200) {
          lastVerdict.current = performance.now();
          setChecks(checksFor(qualityStats(frames.filter((f) => f.t >= t - 3))));
        }
      };
      loop();
    },
    [recordRms, rmsGate, stopMonitor],
  );
  return { level, checks, traceRef, startMonitor, stopMonitor };
}
