import { keyName } from "./melody/key";
import { midiEvents } from "./midi";
// Builds diagnostics for a recorded sample so detection can be inspected/tuned
// offline. Produces a structured object (for a .json sidecar) and a compact text
// report (for pasting inline). Both share one source of truth: buildReportData().

import { freqToMidi, midiToName, type Frame } from "./notes";
import type { Recording } from "./db";
import { processRecording } from "./recording";
import { resolveAnalysisOptions } from "./recording-analysis";
import { BUILD_INFO } from "./build-info";
import type { QualityStats } from "./recorder";

export const SCHEMA_VERSION = 4;

export interface ReportInput {
  recording: Recording;
  context?: { browser: string; audioOutput: string; midiOutput: string };
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

interface FrameRow {
  t: number;
  tMs: number;
  freq: number | null;
  midi: number | null;
  cents: number | null;
  clarity: number;
  rms: number;
}

export function buildReportData(input: ReportInput) {
  const processed = processRecording(input.recording, input.frames);
  const stages = {
    ...processed.interpretation,
    harmony: processed.interpretation.harmony.map((chord) => ({
      ...chord,
      pitchClasses: [...chord.pitchClasses],
    })),
    editCoverage: processed.editCoverage,
    items: processed.items,
    notes: processed.notes,
  };
  const notes = processed.notes;
  const frames: FrameRow[] = input.frames.map((f) => {
    if (f.freq === null) {
      return {
        t: f.t,
        tMs: f.t * 1000,
        freq: null,
        midi: null,
        cents: null,
        clarity: f.clarity,
        rms: f.rms,
      };
    }
    const midi = freqToMidi(f.freq);
    return {
      t: f.t,
      tMs: f.t * 1000,
      freq: f.freq,
      midi: Math.round(midi * 100) / 100,
      cents: Math.round((midi - Math.round(midi)) * 100),
      clarity: f.clarity,
      rms: f.rms,
    };
  });

  return {
    app: "diapason",
    schemaVersion: SCHEMA_VERSION,
    build: BUILD_INFO,
    saved: { ...input.recording, audio: undefined },
    context: input.context ?? { browser: "unknown", audioOutput: "unknown", midiOutput: "unknown" },
    settings: processed.settings,
    analysis: { ...resolveAnalysisOptions(input.recording), masking: "none" },
    stages,
    midiEvents: midiEvents(notes, { bpm: input.recording.bpm }),
    playback: {
      octaveAffectsExport: false,
      instrumentAffectsExport: false,
      externalNoteOffLeadMs: 5,
    },
    title: input.title,
    generated: new Date().toISOString(),
    config: {
      sampleRate: input.sampleRate,
      durationSec: input.durationSec,
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

const f = (n: number, d = 2): string => (Number.isFinite(n) ? n.toFixed(d) : "—");

export function buildReport(input: ReportInput): string {
  const d = buildReportData(input);
  const c = d.config;
  const q = d.quality;
  const lines: string[] = [];

  lines.push(`=== diapason diagnostics: ${d.title} ===`);
  lines.push(`generated: ${d.generated}`);
  lines.push("");
  lines.push("[config]");
  lines.push(
    `sampleRate=${c.sampleRate}Hz  duration=${f(c.durationSec)}s  frames=${d.frames.length}`,
  );
  lines.push(`window=${c.windowSize}  hop=${c.hop}`);
  lines.push(
    `band=${c.minFreq}-${c.maxFreq}Hz  clarityThreshold=${f(c.clarityThreshold, 2)}  rmsGate=${f(c.rmsGate, 4)}`,
  );
  lines.push("");
  lines.push(`build=${d.build.revision} pipeline=${d.build.pipeline} schema=${d.schemaVersion}`);
  lines.push(`[settings] ${JSON.stringify(d.settings)}`);
  lines.push(`[capture] ${JSON.stringify(d.saved.capture)}`);
  lines.push(`[analysis] ${JSON.stringify(d.analysis)}`);
  const s = d.stages;
  lines.push(
    `[stages] preset=${d.settings.melody.preset} key=${s.key.chosen ? keyName(s.key.chosen) : "none"} (${s.key.auto ? "auto" : "chosen"}) faithful=${s.faithful.length} decoded=${s.decoded.length} muted=${s.items.filter((i) => i.muted).length} exported=${s.notes.length}`,
  );
  for (const edit of d.saved.noteEdits?.pitch ?? []) {
    const coverage = s.editCoverage.find((entry) => entry.id === edit.id);
    lines.push(
      `[pitch edit] ${edit.id} midi=${edit.midi} source=${JSON.stringify(edit.ranges)} status=${coverage?.status} missing=${JSON.stringify(coverage?.missing)}`,
    );
  }
  lines.push("[quality]");
  lines.push(
    `voiced=${f(q.voicedRatio * 100, 0)}%  medianClarity=${f(q.medianClarity, 3)}  centsStd=${f(q.centsStd, 1)}  peak=${f(q.peak, 3)}${q.clipped ? " CLIPPING!" : ""}`,
  );
  lines.push("");
  lines.push(`[exported notes]  (${d.notes.length})`);
  if (d.notes.length) {
    d.stages.items
      .filter((item) => !item.muted)
      .forEach(({ note: n, id }) =>
        lines.push(
          `  ${`#${id}`.padStart(3)}  ${n.name.padEnd(4)} start=${f(n.start)}s  len=${f(n.duration)}s`,
        ),
      );
  } else {
    lines.push("  (none)");
  }
  lines.push("");
  lines.push("[frames]  t_ms,freq_hz,midi,note,cents,clarity,rms  (freq blank = unvoiced)");
  for (const fr of d.frames) {
    if (fr.freq === null) {
      lines.push(`${fr.tMs},,,,,,${f(fr.rms, 4)}`);
    } else {
      lines.push(
        `${fr.tMs},${f(fr.freq, 1)},${f(fr.midi!, 2)},${midiToName(fr.midi!)},${fr.cents},${f(fr.clarity, 3)},${f(fr.rms, 4)}`,
      );
    }
  }
  lines.push("=== end ===");
  return lines.join("\n");
}
