import { subscribePcm } from "./ClapInput";
// Microphone capture with the browser's voice DSP explicitly DISABLED.
//
// This is the whole ballgame for whistle detection: by default getUserMedia applies
// echoCancellation / noiseSuppression / autoGainControl, all of which mangle a pure
// whistle tone (noise suppression gates it, AGC pumps the level). We ask for raw audio.

// Chrome-prefixed goog* constraints aren't in the standard typings, so widen the type.
const RAW_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  // Chrome-specific extras that otherwise sneak processing back in:
  ...({
    googEchoCancellation: false,
    googNoiseSuppression: false,
    googAutoGainControl: false,
    googHighpassFilter: false,
  } as Record<string, boolean>),
};

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === "audioinput");
}

export interface MicHandle {
  sampleRate: number;
  /** The live audio context, so recorders can share it. */
  context: AudioContext;
  /** The raw source node, so a recorder worklet can tap the same clean signal. */
  source: MediaStreamAudioSourceNode;
  /** Fill `out` (or an internal buffer) with the latest time-domain samples. */
  readFrame(out?: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer>;
  /** Post-gain node: the clean, boosted signal. Recorders should tap this. */
  tap: AudioNode;
  /** Multiply the input signal (1 = unchanged). Boost helps meters/levels, not pitch. */
  setGain(multiplier: number): void;
  /** What the browser actually gave us — used to confirm DSP really is off. */
  getSettings(): MediaTrackSettings;
  subscribePcm(listener: (samples: Float32Array, startSec: number) => void): Promise<() => void>;
  onEnded?(listener: () => void): () => void;
  close(): void;
}

export interface OpenMicOptions {
  deviceId?: string;
  fftSize?: number;
}

export async function openMic({
  deviceId,
  fftSize = 2048,
}: OpenMicOptions = {}): Promise<MicHandle> {
  const audio: MediaTrackConstraints = { ...RAW_CONSTRAINTS };
  if (deviceId) audio.deviceId = { exact: deviceId };

  const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  if (ctx.state === "suspended") await ctx.resume();

  const source = ctx.createMediaStreamSource(stream);
  // source -> gain -> analyser (and recorders tap the gain output), so a boost shows up
  // in meters, trace, and recordings consistently.
  const gain = ctx.createGain();
  gain.gain.value = 1;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0;
  source.connect(gain);
  gain.connect(analyser);

  const track = stream.getAudioTracks()[0]!;
  const buf = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;

  return {
    sampleRate: ctx.sampleRate,
    context: ctx,
    source,
    tap: gain,
    setGain(multiplier: number): void {
      gain.gain.value = Math.max(0, multiplier);
    },
    readFrame(out: Float32Array<ArrayBuffer> = buf): Float32Array<ArrayBuffer> {
      analyser.getFloatTimeDomainData(out);
      return out;
    },
    getSettings(): MediaTrackSettings {
      return track.getSettings ? track.getSettings() : {};
    },
    subscribePcm: (listener) => subscribePcm(ctx, gain, listener),
    onEnded(listener: () => void): () => void {
      track.addEventListener("ended", listener);
      return () => track.removeEventListener("ended", listener);
    },
    close(): void {
      track.stop();
      source.disconnect();
      gain.disconnect();
      void ctx.close();
    },
  };
}
