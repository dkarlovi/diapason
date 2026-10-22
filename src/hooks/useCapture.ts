import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { openMic, listInputDevices, type MicHandle } from "../audio";
import { createPitchDetector, type PitchDetector } from "../pitch";
import type { Frame } from "../notes";
import { drawTrace, autoRange } from "../trace";
import { createRecorder, qualityStats, type Recorder } from "../recorder";
import { startMetronome, type MetronomeHandle } from "../metronome";
import { encodeAudio } from "../codec";
import { putRecording, type Recording } from "../db";
import { loadLastTuning } from "../tuning";
import { checksFor, fmtDate, type Check } from "../ui";
import {
  dspStatus,
  isDownbeat,
  levelHint,
  noiseCalibration,
  peakLevel,
  trimCountIn,
} from "../capture-model";
import { takePath } from "../router";

const LIVE_WINDOW_SEC = 5;
const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type Beat = { on: boolean; accent: boolean; count: string };

export function useCapture() {
  const navigate = useNavigate();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [gain, setGainValue] = useState(1);
  const [dsp, setDsp] = useState<{ name: string; off: boolean }[]>([]);
  const [sampleRate, setSampleRate] = useState(0);
  const [level, setLevel] = useState({ rms: 0, peak: 0 });
  const [checks, setChecks] = useState<Check[]>([]);
  const [noiseReadout, setNoiseReadout] = useState("not measured yet");
  const [noiseMeasured, setNoiseMeasured] = useState(false);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [bpm, setBpm] = useState(90);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [beat, setBeat] = useState<Beat>({ on: false, accent: false, count: "" });

  const traceRef = useRef<HTMLCanvasElement>(null);
  const mic = useRef<MicHandle | null>(null);
  const detector = useRef<PitchDetector | null>(null);
  const recorder = useRef<Recorder | null>(null);
  const metro = useRef<MetronomeHandle | null>(null);
  const raf = useRef(0);
  const noiseTimer = useRef(0);
  const beatTimer = useRef(0);
  const generation = useRef(0);
  const mounted = useRef(false);
  const gainRef = useRef(gain);
  const micStart = useRef(0);
  const frames = useRef<Frame[]>([]);
  const rmsGate = useRef(0.003);
  const measuring = useRef(false);
  const noiseSamples = useRef<number[]>([]);
  const lastVerdict = useRef(0);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const captureStart = useRef(0);

  const closeMic = useCallback(() => {
    cancelAnimationFrame(raf.current);
    recorder.current?.dispose();
    recorder.current = null;
    mic.current?.close();
    mic.current = null;
    detector.current = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const found = await listInputDevices();
      if (mounted.current) setDevices(found);
    } catch {
      // Device labels can be unavailable before permission is granted.
    }
  }, []);

  const loop = useCallback(() => {
    if (!mounted.current || !mic.current || !detector.current) return;
    raf.current = requestAnimationFrame(loop);
    const t = (performance.now() - micStart.current) / 1000;
    const buf = mic.current.readFrame();
    const { freq, clarity, rms } = detector.current(buf);
    const peak = peakLevel(buf);
    setLevel({ rms, peak });
    if (measuring.current) noiseSamples.current.push(rms);
    frames.current.push({
      t,
      freq: freq !== null && rms >= rmsGate.current ? freq : null,
      clarity,
      rms,
    });
    while (frames.current.length && frames.current[0]!.t < t - (LIVE_WINDOW_SEC + 1))
      frames.current.shift();
    if (traceRef.current)
      drawTrace(traceRef.current, frames.current, {
        tMin: t - LIVE_WINDOW_SEC,
        tMax: t,
        ...autoRange(frames.current),
      });
    if (performance.now() - lastVerdict.current > 200) {
      lastVerdict.current = performance.now();
      setChecks(checksFor(qualityStats(frames.current.filter((f) => f.t >= t - 3))));
    }
  }, []);

  const openDevice = useCallback(
    async (id: string) => {
      if (recordingRef.current || startingRef.current) return;
      const current = ++generation.current;
      window.clearTimeout(noiseTimer.current);
      measuring.current = false;
      noiseSamples.current = [];
      closeMic();
      setDeviceId(id);
      setNoiseMeasured(false);
      setNoiseReadout("not measured yet");
      rmsGate.current = 0.003;
      setStatus("");
      try {
        const opened = await openMic(id ? { deviceId: id } : {});
        if (!mounted.current || current !== generation.current) {
          opened.close();
          return;
        }
        mic.current = opened;
        detector.current = createPitchDetector(opened.sampleRate);
        opened.setGain(gainRef.current);
        micStart.current = performance.now();
        frames.current = [];
        setDsp(dspStatus(opened.getSettings()));
        setSampleRate(opened.sampleRate);
        await refreshDevices();
        if (mounted.current && current === generation.current) loop();
      } catch (error) {
        if (mounted.current && current === generation.current)
          setStatus(`Mic error: ${(error as Error).message}`);
      }
    },
    [closeMic, loop, refreshDevices],
  );

  useEffect(() => {
    mounted.current = true;
    void openDevice("");
    return () => {
      mounted.current = false;
      generation.current++;
      window.clearTimeout(noiseTimer.current);
      window.clearTimeout(beatTimer.current);
      metro.current?.stop();
      metro.current = null;
      recordingRef.current = false;
      startingRef.current = false;
      closeMic();
    };
  }, [closeMic, openDevice]);

  const changeGain = useCallback((value: number) => {
    gainRef.current = value;
    setGainValue(value);
    mic.current?.setGain(value);
  }, []);

  const resume = useCallback(() => {
    void mic.current?.context.resume();
  }, []);

  const measureRoom = useCallback(() => {
    if (measuring.current || !mic.current) return;
    resume();
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
  }, [resume]);

  const flashBeat = useCallback((index: number, bar: number) => {
    if (!mounted.current) return;
    setBeat({ on: true, accent: isDownbeat(index, bar), count: index < 0 ? String(-index) : "" });
    window.clearTimeout(beatTimer.current);
    beatTimer.current = window.setTimeout(() => {
      if (mounted.current) setBeat((previous) => ({ ...previous, on: false }));
    }, 90);
  }, []);

  const startRecording = useCallback(async () => {
    const opened = mic.current;
    if (!opened || recordingRef.current || startingRef.current || !noiseMeasured) return;
    const current = generation.current;
    startingRef.current = true;
    setStarting(true);
    try {
      await opened.context.resume();
      if (!mounted.current || current !== generation.current) return;
      if (!recorder.current) {
        const created = await createRecorder(opened.context, opened.tap);
        if (!mounted.current || current !== generation.current) {
          created.dispose();
          return;
        }
        recorder.current = created;
      }
      const bar = Math.max(1, Math.round(beatsPerBar));
      const tempo = Math.max(40, Math.round(bpm));
      recorder.current.start();
      captureStart.current = opened.context.currentTime;
      recordingRef.current = true;
      setRecording(true);
      setStatus("Counting in…");
      metro.current = startMetronome(opened.context, {
        bpm: tempo,
        beatsPerBar: bar,
        countInBars: 1,
        onBeat: (index) => flashBeat(index, bar),
        onDownbeat: () => {
          if (mounted.current) setStatus("Recording… hit Stop when done.");
        },
      });
    } catch (error) {
      if (mounted.current && current === generation.current) {
        recordingRef.current = false;
        setRecording(false);
        setStatus(`Record error: ${(error as Error).message}`);
      }
    } finally {
      startingRef.current = false;
      if (mounted.current && current === generation.current) setStarting(false);
    }
  }, [beatsPerBar, bpm, flashBeat, noiseMeasured]);

  const stopRecording = useCallback(async () => {
    const opened = mic.current;
    const activeRecorder = recorder.current;
    const metronome = metro.current;
    if (!opened || !activeRecorder || !metronome) return;
    const pcm = activeRecorder.stop();
    const downbeat = metronome.downbeatTime;
    metronome.stop();
    metro.current = null;
    recordingRef.current = false;
    setRecording(false);
    const trimmed = trimCountIn(pcm, downbeat, captureStart.current, opened.sampleRate);
    if (trimmed.length < opened.sampleRate * 0.3) {
      setStatus("Too short — try again.");
      return;
    }
    setSaving(true);
    setStatus("Saving…");
    try {
      const now = Date.now();
      const record: Recording = {
        id: uid(),
        name: `Take ${fmtDate(now)}`,
        createdAt: now,
        sampleRate: opened.sampleRate,
        durationSec: trimmed.length / opened.sampleRate,
        bpm: Math.max(40, Math.round(bpm)),
        beatsPerBar: Math.max(1, Math.round(beatsPerBar)),
        audio: await encodeAudio(trimmed),
        capture: {
          gain: gainRef.current,
          peak: peakLevel(trimmed),
          noiseFloor: rmsGate.current,
          dspOff: dspStatus(opened.getSettings()).every((check) => check.off),
        },
        tuning: loadLastTuning(),
      };
      await putRecording(record);
      if (mounted.current) navigate(takePath(record.id));
    } catch (error) {
      if (mounted.current) {
        setSaving(false);
        setStatus(`Save error: ${(error as Error).message}`);
      }
    }
  }, [beatsPerBar, bpm, navigate]);

  return {
    devices,
    deviceId,
    gain,
    dsp,
    sampleRate,
    level,
    levelHint: levelHint(level.peak),
    checks,
    noiseReadout,
    noiseMeasured,
    recording,
    starting,
    saving,
    status,
    bpm,
    beatsPerBar,
    beat,
    traceRef,
    refreshDevices,
    openDevice,
    changeGain,
    resume,
    measureRoom,
    startRecording,
    stopRecording,
    setBpm,
    setBeatsPerBar,
  };
}
