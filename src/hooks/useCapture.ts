import { useCallback, useEffect, useRef, useState } from "react";
import { useRecordingSetup } from "./useRecordingSetup";
import { createRecorder, type Recorder } from "../recorder";
import { startMetronome, type MetronomeHandle, type TransportState } from "../metronome";
import { encodeAudio } from "../codec";
import { summarizeWaveform } from "../waveform";
import { putRecording, type Recording } from "../db";
import { newRecordingMelody } from "../melody/settings";
import { fmtDate } from "../ui";
import { dspStatus, peakLevel, roundTripLatency, trimCountIn } from "../capture-model";
import { getSoundProfile } from "../recording-profiles";
import { canRecord, type SetupState } from "../recording-setup";
import { useNotice } from "./useNotice";
const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function useCapture() {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [notice, setNotice] = useNotice();
  const [transport, setTransport] = useState<TransportState | null>(null);
  const [beat, setBeat] = useState("");
  const recorder = useRef<Recorder | null>(null);
  const metro = useRef<MetronomeHandle | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const captureStart = useRef(0);
  const snapshot = useRef<SetupState | null>(null);
  const stopDependents = useRef<() => void>(() => {});
  const setError = useCallback(
    (message: string) => {
      setStatus("");
      setNotice(message ? { kind: "error", message } : null);
    },
    [setNotice],
  );
  const releaseCapture = useCallback(() => {
    metro.current?.stop();
    metro.current = null;
    recorder.current?.dispose();
    recorder.current = null;
    busy.current = false;
    stopDependents.current();
    if (mounted.current) {
      setRecording(false);
      setStarting(false);
      setSaving(false);
      setTransport(null);
      setBeat("");
    }
  }, []);
  const isBusy = useCallback(() => busy.current, []);
  const prepared = useRecordingSetup({
    isBusy,
    setStatus: setError,
    onBeforeClose: releaseCapture,
    transport,
  });
  const { setupRef, update, microphone, measurements, tempo } = prepared;
  const { currentMic, isCurrentMic } = microphone;
  useEffect(() => {
    stopDependents.current = prepared.onClose;
  }, [prepared.onClose]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      releaseCapture();
    };
  }, [releaseCapture]);
  const startRecording = async () => {
    const opened = currentMic(),
      current = setupRef.current;
    if (!opened || busy.current || !canRecord(current) || tempo.listening || tempo.pending) return;
    setNotice(null);
    tempo.stop();
    measurements.cancel();
    busy.current = true;
    update({ type: "busy", value: true });
    setStarting(true);
    snapshot.current = current;
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
      recorder.current.start();
      captureStart.current = opened.context.currentTime;
      setRecording(true);
      setStatus("Counting in…");
      const handle = startMetronome(opened.context, {
        bpm: current.bpm,
        beatsPerBar: current.beatsPerBar,
        countInBars: 1,
        onBeat: (index) => {
          if (isCurrentMic(opened) && metro.current)
            setBeat(
              index < 0 ? `Count-in: ${-index}` : `Beat ${(index % current.beatsPerBar) + 1}`,
            );
        },
        onDownbeat: () => {
          if (isCurrentMic(opened) && metro.current) {
            setStatus("Recording… hit Stop when done.");
            setTransport((previous) => (previous ? { ...previous, phase: "recording" } : null));
          }
        },
      });
      metro.current = handle;
      setTransport({
        bpm: current.bpm,
        beatsPerBar: current.beatsPerBar,
        downbeatTime: handle.downbeatTime,
        phase: "count-in",
        running: true,
      });
    } catch (error) {
      if (isCurrentMic(opened)) {
        metro.current?.stop();
        metro.current = null;
        recorder.current?.dispose();
        recorder.current = null;
        busy.current = false;
        update({ type: "busy", value: false });
        setRecording(false);
        setTransport(null);
        setError(`Record error: ${(error as Error).message}`);
      }
    } finally {
      if (isCurrentMic(opened)) setStarting(false);
    }
  };
  const stopRecording = async () => {
    const opened = currentMic(),
      active = recorder.current,
      metronome = metro.current,
      settings = snapshot.current;
    if (!opened || !active || !metronome || !settings?.room) return;
    const pcm = active.stop();
    metronome.stop();
    metro.current = null;
    setRecording(false);
    setTransport(null);
    setBeat("");
    // The performer answers the click they hear, which the mic delivers late.
    const trimmed = trimCountIn(
      pcm,
      metronome.downbeatTime + roundTripLatency(opened.context, opened.getSettings()),
      captureStart.current,
      opened.sampleRate,
    );
    if (trimmed.length < opened.sampleRate * 0.3) {
      busy.current = false;
      update({ type: "busy", value: false });
      setError("Too short — try again.");
      return;
    }
    setSaving(true);
    setStatus("");
    try {
      const now = Date.now(),
        profile = getSoundProfile(settings.profileId);
      const record: Recording = {
        id: uid(),
        name: `Recording ${fmtDate(now)}`,
        createdAt: now,
        sampleRate: opened.sampleRate,
        durationSec: trimmed.length / opened.sampleRate,
        bpm: settings.bpm,
        beatsPerBar: settings.beatsPerBar,
        source: { profileId: profile.id, analysis: { ...profile.analysis } },
        audio: await encodeAudio(trimmed),
        waveform: summarizeWaveform(trimmed),
        capture: {
          gain: settings.gain,
          noiseFloor: settings.room.floor,
          rmsGate: settings.room.gate,
          peak: peakLevel(trimmed),
          dspOff: dspStatus(opened.getSettings()).every((check) => check.off),
        },
        melody: newRecordingMelody(settings.room.gate),
      };
      if (!isCurrentMic(opened)) return;
      await putRecording(record);
      if (mounted.current) {
        setStatus("");
        setNotice({ kind: "success", message: "Recording saved" });
      }
    } catch (error) {
      if (mounted.current)
        setError(`Save error: ${(error as Error).message} — record again to retry.`);
    } finally {
      if (mounted.current) {
        setSaving(false);
        busy.current = false;
        update({ type: "busy", value: false });
      }
    }
  };
  return {
    ...prepared,
    recording,
    starting,
    saving,
    status,
    notice,
    transport,
    beat,
    startRecording,
    stopRecording,
  };
}
