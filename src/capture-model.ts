export interface DspCheck {
  name: string;
  off: boolean;
}

export function dspStatus(settings: MediaTrackSettings): DspCheck[] {
  return (["echoCancellation", "noiseSuppression", "autoGainControl"] as const).map((name) => ({
    name,
    off: settings[name] !== true,
  }));
}

export function peakLevel(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

export function noiseCalibration(samples: number[]): { floor: number; gate: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return { floor, gate: Math.min(0.1, Math.max(0.003, floor * 1.5)) };
}

export function trimCountIn(
  pcm: Float32Array,
  downbeat: number,
  start: number,
  sampleRate: number,
): Float32Array {
  const drop = Math.min(pcm.length, Math.max(0, Math.round((downbeat - start) * sampleRate)));
  return pcm.slice(drop);
}

export function levelHint(peak: number): string {
  if (peak > 0.98) return "⚠ Clipping — lower Input gain or move back.";
  if (peak < 0.08) return "Signal is low — raise Input gain or move closer.";
  return "Good level — whistle a steady note.";
}

export function isDownbeat(beatIndex: number, beatsPerBar: number): boolean {
  return ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
}
