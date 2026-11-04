import type { PitchRange } from "./Pitch";
import type { NoteEvent, Frame } from "../Melody/Notes";

export interface TraceView {
  preferredRange?: PitchRange;
  /** Pitch classes belonging to the effective key; omitted when the key is unknown. */
  scale?: ReadonlySet<number>;
  /** Animated offset between logical and rendered note pitches, including the motion lead. */
  notePitchOffset?: number;
  /** Enable brief warning-badge motion on sounding notes when reduced motion is off. */
  animateKeyWarnings?: boolean;
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
  /** Notes carrying a saved edit, including equal-valued and muted notes: drawn striped. */
  edited?: NoteEvent[];
  /** Automatic positions of edited notes, outlined and linked to the edited note. */
  origins?: NoteOrigin[];
}

export interface NoteOrigin {
  from: NoteEvent;
  to: NoteEvent;
  /** Full strength for the selected note; others are drawn faintly. */
  emphasis?: boolean;
}

/**
 * Static background of a trace (grid, beats and pitch frames), kept between draws so a
 * moving playhead repaints only the notes, playhead and labels above it.
 */
export interface TraceLayer {
  canvas?: HTMLCanvasElement;
  /** Resolved palette; clear it to pick up a theme change. */
  colors?: TraceColors | undefined;
  frames?: Frame[];
  key?: string;
}

export type TraceColors = Record<
  | "bg"
  | "outOfKey"
  | "keyWarning"
  | "keyWarningText"
  | "grid"
  | "gridOctave"
  | "label"
  | "disabledLabel"
  | "line"
  | "faint"
  | "sub"
  | "beat"
  | "bar"
  | "note"
  | "noteEdge"
  | "noteText"
  | "playhead",
  string
>;
