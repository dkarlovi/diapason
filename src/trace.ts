// Canvas renderer for a pitch-over-time trace. Used both for the live scrolling
// calibration view and for inspecting recorded samples. Dependency-free 2D canvas.

import { midiToName, freqToMidi, type Frame, type NoteEvent } from "./notes";

export interface TraceView {
  /** Time window shown, in seconds. */
  tMin: number;
  tMax: number;
  /** MIDI note range shown on the y-axis. */
  midiMin: number;
  midiMax: number;
  /** Tempo grid: vertical lines at each beat (bars emphasized), optional subdivisions. Beat 0 is t=0. */
  beats?: { bpm: number; beatsPerBar: number; subdivision?: number };
  /** Note events drawn as piano-roll bars; the pitch trace is then drawn faintly behind them. */
  notes?: NoteEvent[];
  /** Notes switched off by the user: drawn as dashed outlines. */
  muted?: NoteEvent[];
}

const COLORS = {
  bg: "#0a0d11",
  grid: "#222a34",
  gridOctave: "#2f3a47",
  label: "#8a94a3",
  line: "#5ad1a8",
  faint: "#355f52",
  sub: "#161c24",
  beat: "#2a3441",
  bar: "#45536a",
  note: "#5ad1a8",
  noteEdge: "#b6f2dd",
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
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, w, h);

  const { tMin, tMax, midiMin, midiMax } = view;
  const geometry: TraceGeometry = {
    width: w,
    height: h,
    semitoneHeight: h / (midiMax - midiMin || 1),
    xOf: (t) => ((t - tMin) / (tMax - tMin || 1)) * w,
    yOf: (midi) => h - ((midi - midiMin) / (midiMax - midiMin || 1)) * h,
  };
  drawPitchGrid(ctx, geometry, view);
  drawBeatGrid(ctx, geometry, view);
  drawPitchFrames(ctx, geometry, frames, view);
  drawNoteBars(ctx, geometry, view);
}

interface TraceGeometry {
  width: number;
  height: number;
  semitoneHeight: number;
  xOf(t: number): number;
  yOf(midi: number): number;
}

function drawPitchGrid(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  view: TraceView,
): void {
  const { width: w, yOf } = geometry;
  const { midiMin, midiMax } = view;
  // Horizontal gridlines + note labels at each semitone (octaves emphasized).
  ctx.textBaseline = "middle";
  ctx.font = "10px system-ui, sans-serif";
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
}

function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  view: TraceView,
): void {
  const { height: h, xOf } = geometry;
  const { tMin, tMax, beats } = view;
  // Vertical tempo grid: subdivisions faint, beats medium, bar lines strong.
  if (beats && beats.bpm > 0) {
    const sub = Math.max(1, beats.subdivision ?? 1);
    const step = 60 / beats.bpm / sub;
    const perBar = sub * Math.max(1, beats.beatsPerBar);
    ctx.lineWidth = 1;
    for (let i = Math.max(0, Math.ceil(tMin / step)); i * step <= tMax; i++) {
      const isBar = i % perBar === 0;
      const isBeat = i % sub === 0;
      ctx.strokeStyle = isBar ? COLORS.bar : isBeat ? COLORS.beat : COLORS.sub;
      const x = Math.round(xOf(i * step)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      if (isBar) {
        ctx.fillStyle = COLORS.label;
        ctx.textBaseline = "top";
        ctx.fillText(String(i / perBar + 1), x + 3, 2);
      }
    }
  }
}

function drawPitchFrames(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  frames: Frame[],
  view: TraceView,
): void {
  const { xOf, yOf } = geometry;
  const { tMin, tMax, notes } = view;
  // Pitch trace: connect consecutive voiced frames, brightness by clarity.
  // Behind note bars it's a thin, faint reference.
  const faint = !!notes;
  let prev: { x: number; y: number } | null = null;
  ctx.lineWidth = faint ? 1 : 2;
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
      ctx.strokeStyle = faint || f.clarity <= 0.95 ? COLORS.faint : COLORS.line;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (!faint) {
      ctx.fillStyle = f.clarity > 0.95 ? COLORS.line : COLORS.faint;
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    prev = { x, y };
  }
}

function drawNoteBars(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  view: TraceView,
): void {
  const { xOf, yOf } = geometry;
  const { notes, muted } = view;
  // Piano-roll note bars, one semitone tall, centred on the note.
  const semi = geometry.semitoneHeight;
  if (muted) {
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = COLORS.label;
    for (const n of muted) {
      const x0 = xOf(n.start);
      const x1 = xOf(n.start + n.duration);
      ctx.strokeRect(x0 + 0.5, yOf(n.midi) - semi / 2 + 0.5, Math.max(2, x1 - x0) - 1, semi - 1);
    }
    ctx.setLineDash([]);
  }
  if (notes) {
    ctx.lineWidth = 1;
    for (const n of notes) {
      const x0 = xOf(n.start);
      const x1 = xOf(n.start + n.duration);
      const y = yOf(n.midi) - semi / 2;
      ctx.fillStyle = COLORS.note;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x0, y, Math.max(2, x1 - x0), semi);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = COLORS.noteEdge;
      ctx.strokeRect(x0 + 0.5, y + 0.5, Math.max(2, x1 - x0) - 1, semi - 1);
      if (x1 - x0 > 22 && semi >= 9) {
        ctx.fillStyle = "#06231a";
        ctx.textBaseline = "middle";
        ctx.fillText(n.name, x0 + 3, y + semi / 2);
      }
    }
  }
}
