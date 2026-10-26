// Canvas renderer for a pitch-over-time trace. Used both for the live scrolling
// calibration view and for inspecting recorded samples. Dependency-free 2D canvas.

import { midiToName, freqToMidi, type Frame, type NoteEvent } from "./notes";

export interface TraceView {
  inset?: boolean;
  pitchLabels?: "all" | "none";
  timeLabelY?: number;
  noteHeight?: number;
  /** Time window shown, in seconds. */
  tMin: number;
  tMax: number;
  /** MIDI note range shown on the y-axis. */
  midiMin: number;
  midiMax: number;
  /** Tempo grid: vertical lines at each beat (bars emphasized), optional subdivisions. Beat 0 is t=0. */
  beatOrigin?: number;
  playheadTime?: number;
  /** Hide time/bar numbers for a live preview with no recording start. */
  showTimeLabels?: boolean;
  beats?: { bpm: number; beatsPerBar: number; subdivision?: number };
  /** Note events drawn as piano-roll bars; the pitch trace is then drawn faintly behind them. */
  notes?: NoteEvent[];
  /** Notes switched off by the user: drawn as dashed outlines. */
  muted?: NoteEvent[];
  /** Explicit pitch intent, including equal-valued and muted notes. */
  edited?: NoteEvent[];
}

const DEFAULT_COLORS = {
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
  noteText: "#06231a",
  playhead: "#b6f2dd",
};

type TraceColors = typeof DEFAULT_COLORS;
const palettes = new WeakMap<HTMLCanvasElement, { key: string; colors: TraceColors }>();

function traceColors(canvas: HTMLCanvasElement): TraceColors {
  if (!canvas.matches(".live-trace, .themed-trace")) return DEFAULT_COLORS;
  const style = getComputedStyle(canvas);
  const values = Object.entries(DEFAULT_COLORS).map(
    ([name, fallback]) =>
      [name, style.getPropertyValue("--trace-" + name).trim() || fallback] as const,
  );
  const key =
    values.map(([, value]) => value).join(";") +
    window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const cached = palettes.get(canvas);
  if (cached?.key === key) return cached.colors;
  // Canvas color parsing does not consistently resolve CSS light-dark()/var().
  // Resolve through a CSS color property once per palette, never once per frame.
  const probe = document.createElement("span");
  probe.hidden = true;
  (canvas.parentElement ?? document.body).append(probe);
  const colors = Object.fromEntries(
    values.map(([name, value]) => {
      probe.style.color = value;
      return [name, getComputedStyle(probe).color];
    }),
  ) as TraceColors;
  probe.remove();
  palettes.set(canvas, { key, colors });
  return colors;
}

/** Pick a y-axis range that fits the voiced frames, padded and clamped to sane whistle bounds. */
export function autoRange(frames: Frame[]): { midiMin: number; midiMax: number } {
  const notes = frames.filter((f) => f.freq !== null).map((f) => freqToMidi(f.freq!));
  if (!notes.length) return { midiMin: 67, midiMax: 96 }; // G4..C7 default
  const lo = Math.floor(Math.min(...notes)) - 2;
  const hi = Math.ceil(Math.max(...notes)) + 2;
  return { midiMin: lo, midiMax: Math.max(hi, lo + 6) };
}

export function traceHorizontalPadding(width: number, inset = false) {
  return {
    left: inset ? Math.min(57, width * 0.1) : 0,
    right: inset ? Math.min(18, width * 0.05) : 0,
  };
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

  const colors = traceColors(canvas);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, w, h);

  const { tMin, tMax, midiMin, midiMax } = view;
  const padding = traceHorizontalPadding(w, view.inset);
  const geometry: TraceGeometry = {
    colors,
    width: w,
    height: h,
    semitoneHeight: h / (midiMax - midiMin || 1),
    xOf: (t) =>
      padding.left + ((t - tMin) / (tMax - tMin || 1)) * (w - padding.left - padding.right),
    yOf: (midi) => h - ((midi - midiMin) / (midiMax - midiMin || 1)) * h,
  };
  ctx.textBaseline = "middle";
  ctx.font =
    view.inset || view.pitchLabels ? "12px system-ui, sans-serif" : "10px system-ui, sans-serif";
  ctx.textAlign = "left";
  drawPitchGrid(ctx, geometry, view);
  drawBeatGrid(ctx, geometry, view);
  drawPitchFrames(ctx, geometry, frames, view);
  drawNoteBars(ctx, geometry, view);
  if (view.playheadTime !== undefined) {
    ctx.strokeStyle = colors.playhead;
    ctx.lineWidth = 1;
    const x = geometry.xOf(view.playheadTime);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  drawPitchLabels(ctx, geometry, view);
}

interface TraceGeometry {
  colors: TraceColors;
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
  const { width: w, yOf, colors } = geometry;
  const { midiMin, midiMax } = view;
  for (let m = Math.ceil(midiMin); m <= midiMax; m++) {
    const isC = m % 12 === 0;
    const y = yOf(m);
    ctx.strokeStyle = isC ? colors.gridOctave : colors.grid;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawPitchLabels(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  view: TraceView,
): void {
  if (view.pitchLabels === "none") return;
  const { width: w, height: h, yOf, colors } = geometry;
  const { midiMin, midiMax } = view;
  const edge = view.inset ? traceHorizontalPadding(w, true).left : 36;
  const fade = ctx.createLinearGradient(edge, 0, edge + 16, 0);
  fade.addColorStop(0, colors.bg);
  fade.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, edge, h);
  ctx.fillStyle = fade;
  ctx.fillRect(edge, 0, 16, h);
  ctx.globalAlpha = 1;
  ctx.textBaseline = "middle";
  ctx.font =
    view.inset || view.pitchLabels ? "12px system-ui, sans-serif" : "10px system-ui, sans-serif";
  ctx.textAlign = view.inset ? "right" : "left";
  const labelX = view.inset ? edge - 6 : 3;
  for (let m = Math.ceil(midiMin); m <= midiMax; m++) {
    const isC = m % 12 === 0;
    const y = yOf(m);
    if ((isC || view.pitchLabels === "all") && (!view.timeLabelY || y > view.timeLabelY + 10)) {
      ctx.fillStyle = colors.label;
      ctx.fillText(midiToName(m), labelX, y - 6);
    }
  }
  ctx.textAlign = "left";
}

function drawBeatGrid(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  view: TraceView,
): void {
  const { height: h, xOf, colors } = geometry;
  const { tMin, tMax, beats } = view;
  // Vertical tempo grid: subdivisions faint, beats medium, bar lines strong.
  if (beats && beats.bpm > 0) {
    const origin = view.beatOrigin ?? 0;
    const sub = Math.max(1, beats.subdivision ?? 1);
    const step = 60 / beats.bpm / sub;
    const perBar = sub * Math.max(1, beats.beatsPerBar);
    ctx.lineWidth = 1;
    for (
      let i =
        view.beatOrigin === undefined
          ? Math.max(0, Math.ceil(tMin / step))
          : Math.ceil((tMin - origin) / step);
      origin + i * step <= tMax;
      i++
    ) {
      drawBeatLine(
        ctx,
        xOf(origin + i * step),
        i,
        perBar,
        sub,
        h,
        view.showTimeLabels !== false,
        colors,
        view.timeLabelY,
      );
    }
  } else if (view.showTimeLabels !== false) {
    ctx.fillStyle = colors.label;
    ctx.strokeStyle = colors.grid;
    for (let second = Math.ceil(tMin); second <= tMax; second++) {
      const x = xOf(second);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
      ctx.fillText(`${second}s`, x + 3, 12);
    }
  }
}

function drawPitchFrames(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  frames: Frame[],
  view: TraceView,
): void {
  const { xOf, yOf, colors } = geometry;
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
      ctx.strokeStyle = faint || f.clarity <= 0.95 ? colors.faint : colors.line;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    if (!faint) {
      ctx.fillStyle = f.clarity > 0.95 ? colors.line : colors.faint;
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
  const { xOf, yOf, colors } = geometry;
  const { notes, muted } = view;
  // Piano-roll note bars, one semitone tall, centred on the note.
  const semi = geometry.semitoneHeight;
  if (muted) {
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = colors.label;
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
      paintNote(ctx, geometry, view, n);
    }
  }
  ctx.fillStyle = colors.label;
  ctx.textBaseline = "middle";
  for (const note of view.edited ?? []) {
    ctx.fillText("•", xOf(note.start) + 3, yOf(note.midi));
  }
}

function paintNote(
  ctx: CanvasRenderingContext2D,
  geometry: TraceGeometry,
  view: TraceView,
  note: NoteEvent,
) {
  const { xOf, yOf, colors, semitoneHeight } = geometry;
  const x = xOf(note.start),
    width = Math.max(2, xOf(note.start + note.duration) - x);
  const height = semitoneHeight * (view.noteHeight ?? 1);
  const y = yOf(note.midi) - height / 2;
  const sounding =
    view.playheadTime !== undefined &&
    view.playheadTime >= note.start &&
    view.playheadTime < note.start + note.duration;
  ctx.fillStyle = sounding ? colors.playhead : colors.note;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = colors.noteEdge;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  if (width > 22 && height >= 9) {
    ctx.fillStyle = colors.noteText;
    ctx.textBaseline = "middle";
    ctx.fillText(note.name, x + 3, y + height / 2);
  }
}

function drawBeatLine(
  ctx: CanvasRenderingContext2D,
  position: number,
  index: number,
  perBar: number,
  sub: number,
  height: number,
  showLabel: boolean,
  colors: TraceColors,
  labelY = 2,
): void {
  const isBar = index % perBar === 0;
  ctx.strokeStyle = isBar ? colors.bar : index % sub === 0 ? colors.beat : colors.sub;
  const x = Math.round(position) + 0.5;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  if (isBar && showLabel) {
    ctx.fillStyle = colors.label;
    ctx.textBaseline = "top";
    ctx.fillText(index < 0 ? "Count-in" : String(index / perBar + 1), x + 3, labelY);
  }
}
