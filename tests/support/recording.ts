import type { AudioRecording } from "../../src/db";
export function recording(overrides: Partial<AudioRecording> = {}): AudioRecording {
  return {
    id: "regression",
    name: "Whistle",
    createdAt: 0,
    sampleRate: 48000,
    durationSec: 1,
    bpm: 95,
    beatsPerBar: 4,
    audio: new Blob(),
    capture: { gain: 1, peak: 0.1, noiseFloor: 0.001, dspOff: true },
    tuning: {},
    ...overrides,
  };
}
