import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useMicrophone } from "./useMicrophone";
import { createRecorder, type Recorder } from "../recorder";
import { startMetronome, type MetronomeHandle } from "../metronome";
import { encodeAudio } from "../codec";
import { putRecording, type Recording } from "../db";
import { loadLastTuning } from "../tuning";
import { fmtDate } from "../ui";
import { dspStatus, isDownbeat, peakLevel, trimCountIn } from "../capture-model";
import { recordingPath } from "../router";

const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
type Beat = { on: boolean; accent: boolean; count: string };

export function useCapture() {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const recorder = useRef<Recorder | null>(null);
  const metro = useRef<MetronomeHandle | null>(null);

  const [bpm, setBpm] = useState(90);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [beat, setBeat] = useState<Beat>({ on: false, accent: false, count: "" });

  const beatTimer = useRef(0);
  const mounted = useRef(false);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const captureStart = useRef(0);

  const releaseCapture = useCallback(() => {
    window.clearTimeout(beatTimer.current);
    metro.current?.stop();
    metro.current = null;
    recorder.current?.dispose();
    recorder.current = null;
    recordingRef.current = false;
    startingRef.current = false;
  }, []);
  const isBusy = useCallback(() => recordingRef.current || startingRef.current, []);
  const microphone = useMicrophone({ isBusy, onError: setStatus, onBeforeClose: releaseCapture });
  const { currentMic, isCurrentMic, captureSettings, noiseMeasured } = microphone;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseCapture();
    };
  }, [releaseCapture]);

  const flashBeat = useCallback((index: number, bar: number) => {
    if (!mounted.current) return;
    setBeat({ on: true, accent: isDownbeat(index, bar), count: index < 0 ? String(-index) : "" });
    window.clearTimeout(beatTimer.current);
    beatTimer.current = window.setTimeout(() => {
      if (mounted.current) setBeat((previous) => ({ ...previous, on: false }));
    }, 90);
  }, []);

  const startRecording = useCallback(async () => {
    const opened = currentMic();
    if (!opened || recordingRef.current || startingRef.current || !noiseMeasured) return;
    startingRef.current = true;
    setStarting(true);
    try {
      await opened.context.resume();
      if (!isCurrentMic(opened)) return;
      if (!recorder.current) {
        const created = await createRecorder(opened.context, opened.tap);
        if (!isCurrentMic(opened)) {
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
      if (isCurrentMic(opened)) {
        recordingRef.current = false;
        setRecording(false);
        setStatus(`Record error: ${(error as Error).message}`);
      }
    } finally {
      startingRef.current = false;
      if (isCurrentMic(opened)) setStarting(false);
    }
  }, [beatsPerBar, bpm, flashBeat, noiseMeasured, currentMic, isCurrentMic]);

  const stopRecording = useCallback(async () => {
    const opened = currentMic();
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
        name: `Recording ${fmtDate(now)}`,
        createdAt: now,
        sampleRate: opened.sampleRate,
        durationSec: trimmed.length / opened.sampleRate,
        bpm: Math.max(40, Math.round(bpm)),
        beatsPerBar: Math.max(1, Math.round(beatsPerBar)),
        audio: await encodeAudio(trimmed),
        capture: {
          ...captureSettings(),
          peak: peakLevel(trimmed),
          dspOff: dspStatus(opened.getSettings()).every((check) => check.off),
        },
        tuning: loadLastTuning(),
      };
      await putRecording(record);
      if (mounted.current) navigate(recordingPath(record.id));
    } catch (error) {
      if (mounted.current) {
        setSaving(false);
        setStatus(`Save error: ${(error as Error).message}`);
      }
    }
  }, [beatsPerBar, bpm, navigate, currentMic, captureSettings]);

  return {
    devices: microphone.devices,
    deviceId: microphone.deviceId,
    gain: microphone.gain,
    dsp: microphone.dsp,
    sampleRate: microphone.sampleRate,
    level: microphone.level,
    levelHint: microphone.levelHint,
    checks: microphone.checks,
    noiseReadout: microphone.noiseReadout,
    noiseMeasured,
    traceRef: microphone.traceRef,
    refreshDevices: microphone.refreshDevices,
    openDevice: microphone.openDevice,
    changeGain: microphone.changeGain,
    resume: microphone.resume,
    measureRoom: microphone.measureRoom,
    recording,
    starting,
    saving,
    status,
    bpm,
    beatsPerBar,
    beat,
    startRecording,
    stopRecording,
    setBpm,
    setBeatsPerBar,
  };
}
