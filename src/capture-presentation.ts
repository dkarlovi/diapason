import type { SetupState, SetupStep } from "./recording-setup";
import { validTempo } from "./recording-setup";
import { getSoundProfile } from "./recording-profiles";
import { freqToMidi, midiToName } from "./notes";

export interface LiveLevel {
  rms: number;
  peak: number;
  freq: number | null;
}

function signalMessage(clipping: boolean, note: string | null, rms: number) {
  if (clipping) return "Signal is clipping — lower input gain.";
  if (note) return "Pitch detected: " + note;
  if (rms > 0.003) return "Sound detected; no whistle pitch detected.";
  return "Listening — whistle a steady note.";
}

export function liveReadout(level: LiveLevel) {
  const clipping = level.peak >= 0.98;
  const note = level.freq === null ? null : midiToName(Math.round(freqToMidi(level.freq)));
  const frequency =
    level.freq !== null
      ? Math.round(level.freq) + " Hz"
      : level.rms > 0.003
        ? "No pitch"
        : "Listening";
  const db = level.rms > 0 ? Math.round(20 * Math.log10(level.rms)) + " dB" : "−∞ dB";
  return {
    clipping,
    note,
    frequency,
    db,
    message: signalMessage(clipping, note, level.rms),
    percent: Math.round(Math.min(100, level.rms * 400)),
  };
}

export const CAPTURE_STEPS: {
  id: SetupStep;
  label: string;
  compactLabel?: string;
  title: string;
}[] = [
  { id: "sound", label: "Sound", title: "Choose your sound" },
  { id: "microphone", label: "Microphone", compactLabel: "Mic", title: "Set up your microphone" },
  { id: "room", label: "Room noise", compactLabel: "Room", title: "Measure room noise" },
  { id: "sound-check", label: "Sound check", compactLabel: "Check", title: "Check your sound" },
  { id: "tempo", label: "Tempo", title: "Find your tempo" },
  { id: "record", label: "Record", title: "Record" },
];

export function stepSummary(step: SetupStep, setup: SetupState, microphone: string): string {
  switch (step) {
    case "sound":
      return setup.soundConfirmed ? getSoundProfile(setup.profileId).label : "Source";
    case "microphone":
      return setup.micReady ? `${microphone} · ${setup.gain.toFixed(1)}×` : "Input · gain";
    case "room":
      return setup.room?.pass
        ? `${Math.round(20 * Math.log10(Math.max(setup.room.floor, 0.000001)))} dB`
        : "Noise floor";
    case "sound-check":
      return setup.sound?.pass ? "Clear signal" : "Pitch · level";
    case "tempo":
      return validTempo(setup.bpm, setup.beatsPerBar)
        ? `${setup.bpm} BPM · ${setup.beatsPerBar} beats`
        : "Pulse · meter";
    case "record":
      return "1 bar count-in";
  }
}

export function compactStepSummary(step: SetupStep, setup: SetupState, microphone: string): string {
  const summaries: Partial<Record<SetupStep, string>> = {
    microphone: setup.micReady ? microphone : "Input",
    "sound-check": setup.sound?.pass ? "Clear" : "Pitch",
    tempo: validTempo(setup.bpm, setup.beatsPerBar) ? `${setup.bpm} BPM` : "Pulse",
    record: "1 bar",
  };
  return summaries[step] ?? stepSummary(step, setup, microphone);
}
