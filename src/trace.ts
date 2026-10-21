// Canvas renderer for a pitch-over-time trace. Used both for the live scrolling
// calibration view and for inspecting recorded samples. Dependency-free 2D canvas.

import { midiToName, freqToMidi, type Frame } from './notes';

export interface TraceView {
  /** Time window shown, in seconds. */
  tMin: number;
  tMax: number;
  /** MIDI note range shown on the y-axis. */
  midiMin: number;
  midiMax: number;
}

const COLORS = {
  bg: '#0a0d11',
  grid: '#222a34',
  gridOctave: '#2f3a47',
  label: '#8a94a3',
  line: '#5ad1a8',
  faint: '#355f52',
};

/** Pick a y-axis range that fits the voiced frames, padded and clamped to sane whistle bounds. */
export function autoRange(frames: Frame[]): { midiMin: number; midiMax: number } {
  const notes = frames.filter((f) => f.freq !== null).map((f) => freqToMidi(f.freq!));
  if (!notes.length) return { midiMin: 67, midiMax: 96 }; // G4..C7 default
  const lo = Math.floor(Math.min(...notes)) - 2;
  const hi = Math.ceil(Math.max(...notes)) + 2;
  return { midiMin: lo, midiMax: Math.max(hi, lo + 6) };
}

export function drawTrace(canvas: HTMLCanvasElement, frames: Frame[], view: TraceView): void {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  const { tMin, tMax, midiMin, midiMax } = view;
  const xOf = (t: number): number => ((t - tMin) / (tMax - tMin || 1)) * w;
  const yOf = (midi: number): number => h - ((midi - midiMin) / (midiMax - midiMin || 1)) * h;

  // Horizontal gridlines + note labels at each semitone (octaves emphasized).
  ctx.textBaseline = 'middle';
  ctx.font = '10px system-ui, sans-serif';
  for (let m = Math.ceil(midiMin); m <= midiMax; m++) {
    const isC = m % 12 === 0;
    const y = yOf(m);
    ctx.strokeStyle = isC ? COLORS.gridOctave : COLORS.grid;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    if (isC) {
      ctx.fillStyle = COLORS.label;
      ctx.fillText(midiToName(m), 3, y - 6);
    }
  }

  // Pitch trace: connect consecutive voiced frames, brightness by clarity.
  let prev: { x: number; y: number } | null = null;
  ctx.lineWidth = 2;
  for (const f of frames) {
    if (f.t < tMin || f.t > tMax) {
      prev = null;
      continue;
    }
    if (f.freq === null) {
      prev = null;
      continue;
    }
    const x = xOf(f.t);
    const y = yOf(freqToMidi(f.freq));
    if (prev) {
      ctx.strokeStyle = f.clarity > 0.95 ? COLORS.line : COLORS.faint;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.fillStyle = f.clarity > 0.95 ? COLORS.line : COLORS.faint;
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fill();
    prev = { x, y };
  }
}
