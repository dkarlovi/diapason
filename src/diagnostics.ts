// Builds diagnostics for a recorded sample so detection can be inspected/tuned
// offline. Produces a structured object (for a .json sidecar) and a compact text
// report (for pasting inline). Both share one source of truth: buildReportData().

import { freqToMidi, midiToName, segmentNotes, type Frame, type NoteEvent } from './notes';
import type { QualityStats } from './recorder';

export interface ReportInput {
  title: string;
  sampleRate: number;
  durationSec: number;
  windowSize: number;
  hop: number;
  detector: { minFreq: number; maxFreq: number; clarityThreshold: number };
  rmsGate: number;
  frames: Frame[];
  stats: QualityStats;
}

export interface FrameRow {
  tMs: number;
  freq: number | null;
  midi: number | null;
  cents: number | null;
  clarity: number;
  rms: number;
}

export interface ReportData {
  app: 'diapason';
  title: string;
  generated: string;
  config: {
    sampleRate: number;
    durationSec: number;
    windowSize: number;
    hop: number;
    minFreq: number;
    maxFreq: number;
    clarityThreshold: number;
    rmsGate: number;
  };
  quality: QualityStats;
  notes: NoteEvent[];
  frames: FrameRow[];
}

export function buildReportData(input: ReportInput): ReportData {
  const notes = segmentNotes(input.frames, { rmsGate: input.rmsGate });
  const frames: FrameRow[] = input.frames.map((f) => {
    if (f.freq === null) {
      return { tMs: Math.round(f.t * 1000), freq: null, midi: null, cents: null, clarity: f.clarity, rms: f.rms };
    }
    const midi = freqToMidi(f.freq);
    return {
      tMs: Math.round(f.t * 1000),
      freq: Math.round(f.freq * 10) / 10,
      midi: Math.round(midi * 100) / 100,
      cents: Math.round((midi - Math.round(midi)) * 100),
      clarity: Math.round(f.clarity * 1000) / 1000,
      rms: Math.round(f.rms * 10000) / 10000,
    };
  });

  return {
    app: 'diapason',
    title: input.title,
    generated: new Date().toISOString(),
    config: {
      sampleRate: input.sampleRate,
      durationSec: Math.round(input.durationSec * 1000) / 1000,
      windowSize: input.windowSize,
      hop: input.hop,
      minFreq: input.detector.minFreq,
      maxFreq: input.detector.maxFreq,
      clarityThreshold: input.detector.clarityThreshold,
      rmsGate: input.rmsGate,
    },
    quality: input.stats,
    notes,
    frames,
  };
}

const f = (n: number, d = 2): string => (Number.isFinite(n) ? n.toFixed(d) : '—');

export function buildReport(input: ReportInput): string {
  const d = buildReportData(input);
  const c = d.config;
  const q = d.quality;
  const lines: string[] = [];

  lines.push(`=== diapason diagnostics: ${d.title} ===`);
  lines.push(`generated: ${d.generated}`);
  lines.push('');
  lines.push('[config]');
  lines.push(`sampleRate=${c.sampleRate}Hz  duration=${f(c.durationSec)}s  frames=${d.frames.length}`);
  lines.push(`window=${c.windowSize}  hop=${c.hop}`);
  lines.push(`band=${c.minFreq}-${c.maxFreq}Hz  clarityThreshold=${f(c.clarityThreshold, 2)}  rmsGate=${f(c.rmsGate, 4)}`);
  lines.push('');
  lines.push('[quality]');
  lines.push(
    `voiced=${f(q.voicedRatio * 100, 0)}%  medianClarity=${f(q.medianClarity, 3)}  centsStd=${f(q.centsStd, 1)}  peak=${f(q.peak, 3)}${q.clipped ? ' CLIPPING!' : ''}`,
  );
  lines.push('');
  lines.push(`[segmented notes]  (${d.notes.length})`);
  if (d.notes.length) {
    d.notes.forEach((n, i) =>
      lines.push(`  ${String(i + 1).padStart(2)}  ${n.name.padEnd(4)} start=${f(n.start)}s  len=${f(n.duration)}s`),
    );
  } else {
    lines.push('  (none)');
  }
  lines.push('');
  lines.push('[frames]  t_ms,freq_hz,midi,note,cents,clarity,rms  (freq blank = unvoiced)');
  for (const fr of d.frames) {
    if (fr.freq === null) {
      lines.push(`${fr.tMs},,,,,,${f(fr.rms, 4)}`);
    } else {
      lines.push(`${fr.tMs},${f(fr.freq, 1)},${f(fr.midi!, 2)},${midiToName(fr.midi!)},${fr.cents},${f(fr.clarity, 3)},${f(fr.rms, 4)}`);
    }
  }
  lines.push('=== end ===');
  return lines.join('\n');
}
