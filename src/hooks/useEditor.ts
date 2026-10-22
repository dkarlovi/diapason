import { useEffect } from "react";
import { getRecording, putRecording, deleteRecording, type Recording } from "../db";
import { decodeAudio } from "../codec";
import { analyzeBuffer, ANALYZE_DEFAULTS, qualityStats, type QualityStats } from "../recorder";
import type { Frame, NoteEvent } from "../notes";
import { PITCH_DEFAULTS } from "../pitch";
import { drawTrace, autoRange, type TraceView } from "../trace";
import { takeItems, takeNotes, covers, DEFAULT_QUANTIZE, type NoteItem } from "../take";
import { notesToMidi } from "../midi";
import { encodeWav } from "../wav";
import { buildReport, buildReportData, type ReportInput } from "../diagnostics";
import { DEFAULT_TUNING, saveLastTuning, type Tuning } from "../tuning";
import { $, downloadBlob } from "../ui";
import { go, takePath } from "../router";
import { playPcm, playNotes, type Playback } from "../playback";
import { DEFAULT_PLAY, type PlaySettings } from "../instruments";
import { onOutputChange, activeOutput } from "../midiout";

let rec: Recording | null = null;
let pcm = new Float32Array(0);
let frames: Frame[] = [];
let stats: QualityStats | null = null;
let persistTimer = 0;
let playback: Playback | null = null;
let playingBtn: HTMLButtonElement | null = null;
let rafId = 0;
let preview: Playback | null = null;
let offOutput: (() => void) | null = null;
let loadGeneration = 0;

/** Slider id ↔ tuning key, with the slider's unit conversion and value label. */
interface Slider {
  id: string;
  key: keyof Tuning;
  toUi: (v: number) => number;
  fromUi: (v: number) => number;
  fmt: (ui: number) => string;
}
const ms = {
  toUi: (v: number) => Math.round(v * 1000),
  fromUi: (v: number) => v / 1000,
  fmt: (v: number) => `${v} ms`,
};
const same = { toUi: (v: number) => v, fromUi: (v: number) => v };
const SLIDERS: Slider[] = [
  {
    id: "t-sticky",
    key: "hysteresisSemitones",
    ...same,
    fmt: (v) => `±${(0.5 + v).toFixed(2)} st`,
  },
  { id: "t-minlen", key: "minDurationSec", ...ms },
  { id: "t-silence", key: "silenceGapSec", ...ms },
  { id: "t-debounce", key: "changeDebounceSec", ...ms },
  { id: "t-smooth", key: "medianWindow", ...same, fmt: (v) => `${v} fr` },
  { id: "t-clarity", key: "clarityThreshold", ...same, fmt: (v) => v.toFixed(3) },
  { id: "t-gate", key: "rmsGate", ...same, fmt: (v) => v.toFixed(3) },
];
const input = (id: string): HTMLInputElement => $<HTMLInputElement>(id);

function writeSliders(t: Tuning): void {
  for (const s of SLIDERS) input(s.id).value = String(s.toUi(t[s.key]));
}

function readSliders(): Tuning {
  const t = { ...DEFAULT_TUNING };
  for (const s of SLIDERS) t[s.key] = s.fromUi(Number(input(s.id).value));
  return t;
}

function refreshLabels(): void {
  for (const s of SLIDERS) $(`${s.id}-v`).textContent = s.fmt(Number(input(s.id).value));
}

function noteItems(): NoteItem[] {
  return rec ? takeItems(rec, frames) : [];
}

function currentNotes(): NoteEvent[] {
  return rec ? takeNotes(rec, frames) : [];
}

// What the MIDI grid currently shows, for hit-testing clicks without re-segmenting.
let rollView: TraceView | null = null;
let rollItems: NoteItem[] = [];

/** The note under a mouse position on the MIDI grid, if any. */
function noteAt(e: MouseEvent): NoteItem | null {
  if (!rollView) return null;
  const canvas = e.currentTarget as HTMLCanvasElement;
  const r = canvas.getBoundingClientRect();
  const { tMin, tMax, midiMin, midiMax } = rollView;
  const t = tMin + ((e.clientX - r.left) / r.width) * (tMax - tMin);
  const midi = midiMax - ((e.clientY - r.top) / r.height) * (midiMax - midiMin);
  const padT = (4 / r.width) * (tMax - tMin); // a few px of slack for tiny notes
  let best: NoteItem | null = null;
  for (const it of rollItems) {
    const { start, duration } = it.note;
    if (t < start - padT || t > start + duration + padT) continue;
    const d = Math.abs(midi - it.note.midi);
    if (d <= 0.75 && (!best || d < Math.abs(midi - best.note.midi))) best = it;
  }
  return best;
}

function toggleMute(it: NoteItem): void {
  if (!rec) return;
  const muted = rec.muted ?? [];
  rec.muted = it.muted
    ? muted.filter((m) => !covers(m, it.raw))
    : [...muted, { t: it.raw.start + it.raw.duration / 2, midi: it.raw.midi }];
  void putRecording(rec);
  render();
}

function reportInput(): ReportInput {
  return {
    title: rec!.name,
    sampleRate: rec!.sampleRate,
    durationSec: rec!.durationSec,
    windowSize: ANALYZE_DEFAULTS.windowSize,
    hop: ANALYZE_DEFAULTS.hop,
    detector: {
      minFreq: PITCH_DEFAULTS.minFreq,
      maxFreq: PITCH_DEFAULTS.maxFreq,
      clarityThreshold: PITCH_DEFAULTS.clarityThreshold,
    },
    rmsGate: rec!.tuning.rmsGate ?? DEFAULT_TUNING.rmsGate,
    frames,
    stats: stats!,
  };
}

function render(): void {
  if (!rec) return;
  // Both grids share time axis, pitch range and beat lines so they line up 1:1.
  const view = { tMin: 0, tMax: rec.durationSec, ...autoRange(frames) };
  const beats = { bpm: rec.bpm, beatsPerBar: rec.beatsPerBar };
  drawTrace($<HTMLCanvasElement>("ed-trace"), frames, { ...view, beats });

  const items = noteItems();
  rollItems = items;
  const notes = items.filter((i) => !i.muted).map((i) => i.note);
  const muted = items.filter((i) => i.muted).map((i) => i.note);
  const quant = input("ed-quant-on").checked;
  const sel = $<HTMLSelectElement>("ed-subdiv");
  const sub = Number(sel.value);
  rollView = { ...view, beats: { ...beats, subdivision: quant ? sub : 1 }, notes, muted };
  drawTrace($<HTMLCanvasElement>("ed-roll"), frames, rollView);
  sel.disabled = !quant;
  const grid = quant ? sel.selectedOptions[0]!.text : "not quantized";
  $("ed-notes").textContent =
    `${notes.length} notes${muted.length ? ` · ${muted.length} muted` : ""} · ${grid}`;
}

function stopPlayback(): void {
  playback?.stop();
  playback = null;
  if (playingBtn) playingBtn.textContent = playingBtn.dataset.label!;
  playingBtn = null;
  cancelAnimationFrame(rafId);
  for (const ph of document.querySelectorAll<HTMLElement>("#view-editor .playhead"))
    ph.hidden = true;
}

/** Toggle playback from `btn`; the playhead sweeps both grids since they share a time axis. */
function togglePlayback(btn: HTMLButtonElement, start: () => Playback): void {
  const wasThis = playingBtn === btn;
  stopPlayback();
  if (wasThis || !rec) return;
  btn.dataset.label ??= btn.textContent!;
  btn.textContent = "■ Stop";
  playingBtn = btn;
  playback = start();
  const heads = document.querySelectorAll<HTMLElement>("#view-editor .playhead");
  const dur = rec.durationSec;
  const tick = (): void => {
    const p = playback?.position();
    if (p == null) return stopPlayback();
    for (const ph of heads) {
      ph.hidden = false;
      ph.style.left = `${Math.min(100, (p / dur) * 100)}%`;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function onTuneChange(): void {
  if (!rec) return;
  refreshLabels();
  rec.tuning = readSliders();
  render();
  // Persist (debounced — a slider drag fires many events).
  window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    if (!rec) return;
    void putRecording(rec);
    saveLastTuning(rec.tuning as Tuning);
  }, 300);
}

async function load(id: string, generation: number): Promise<void> {
  const r = await getRecording(id);
  if (generation !== loadGeneration) return;
  if (!r) {
    go("/");
    return;
  }
  stopPlayback();
  const decoded = await decodeAudio(r.audio);
  if (generation !== loadGeneration) return;
  rec = r;
  pcm = decoded;
  frames = analyzeBuffer(pcm, r.sampleRate, { maskBpm: r.bpm });
  stats = qualityStats(frames, pcm);

  ($("ed-name") as HTMLInputElement).value = r.name;
  $("ed-meta").textContent =
    `${r.bpm} BPM · ${r.beatsPerBar}/4 · ${r.durationSec.toFixed(1)}s · ${r.sampleRate} Hz${r.capture.dspOff ? "" : " · ⚠ DSP was on"}`;
  writeSliders({ ...DEFAULT_TUNING, ...r.tuning });
  const q = r.quantize ?? DEFAULT_QUANTIZE;
  input("ed-quant-on").checked = q.on;
  const play = r.play ?? DEFAULT_PLAY;
  $<HTMLSelectElement>("ed-instrument").value = play.instrument;
  $<HTMLSelectElement>("ed-octave").value = String(play.octave);
  $<HTMLSelectElement>("ed-subdiv").value = String(q.subdivision);
  refreshLabels();
  const log = $<HTMLTextAreaElement>("ed-log-out");
  log.value = "";
  log.hidden = true;
  $("ed-copy-status").textContent = "";
  render();
}

function activateEditor(id: string): void {
  rec = null;
  document.body.classList.add("wide");
  window.addEventListener("resize", render);

  for (const s of SLIDERS) {
    input(s.id).oninput = onTuneChange;
    // Double-click a label to reset just that slider.
    document.querySelector<HTMLLabelElement>(`label[for="${s.id}"]`)!.ondblclick = (e): void => {
      e.preventDefault();
      input(s.id).value = String(s.toUi(DEFAULT_TUNING[s.key]));
      onTuneChange();
    };
  }
  $("ed-reset-tuning").onclick = (): void => {
    writeSliders(DEFAULT_TUNING);
    onTuneChange();
  };
  $("ed-quant-on").onchange = $("ed-subdiv").onchange = (): void => {
    if (!rec) return;
    rec.quantize = {
      on: input("ed-quant-on").checked,
      subdivision: Number($<HTMLSelectElement>("ed-subdiv").value),
    };
    void putRecording(rec);
    render();
  };

  ($("ed-name") as HTMLInputElement).onchange = (e): void => {
    if (!rec) return;
    rec.name = (e.target as HTMLInputElement).value.trim() || "Untitled";
    void putRecording(rec);
  };

  $("ed-duplicate").onclick = async (): Promise<void> => {
    if (!rec) return;
    const copy: Recording = {
      ...rec,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${rec.name} (copy)`,
      createdAt: Date.now(),
    };
    await putRecording(copy);
    go(takePath(copy.id));
  };
  $("ed-delete").onclick = async (): Promise<void> => {
    if (!rec || !confirm(`Delete “${rec.name}”?`)) return;
    await deleteRecording(rec.id);
    go("/");
  };

  const roll = $<HTMLCanvasElement>("ed-roll");
  // Plain click auditions a note (muted ones too); Ctrl/Cmd+click mutes or unmutes it.
  roll.onclick = (e): void => {
    const it = noteAt(e);
    if (!it) return;
    if (e.ctrlKey || e.metaKey) return toggleMute(it);
    preview?.stop();
    preview = playNotes([{ ...it.note, start: 0 }], it.note.duration, rec?.play);
  };
  roll.onmousemove = (e): void => {
    roll.style.cursor = noteAt(e) ? "pointer" : "";
  };

  // Playback instrument/octave, saved with the take.
  const instSel = $<HTMLSelectElement>("ed-instrument");
  const octSel = $<HTMLSelectElement>("ed-octave");
  instSel.onchange = octSel.onchange = (): void => {
    if (!rec) return;
    rec.play = {
      instrument: instSel.value as PlaySettings["instrument"],
      octave: Number(octSel.value),
    };
    void putRecording(rec);
  };

  // MIDI out is picked in the header; an external synth picks its own sound,
  // so only the octave applies then.
  const syncInstrument = (): void => {
    instSel.disabled = !!activeOutput();
    instSel.title = instSel.disabled
      ? "Playing through a MIDI device — it picks the sound."
      : "Instrument for playback (the .mid has no instrument).";
  };
  syncInstrument();
  offOutput?.();
  offOutput = onOutputChange(() => {
    stopPlayback(); // don't leave a take playing on the old output
    syncInstrument();
  });

  $("ed-play-audio").onclick = (e): void =>
    togglePlayback(e.currentTarget as HTMLButtonElement, () => playPcm(pcm, rec!.sampleRate));
  $("ed-play-midi").onclick = (e): void =>
    togglePlayback(e.currentTarget as HTMLButtonElement, () =>
      playNotes(currentNotes(), rec!.durationSec, rec!.play),
    );

  $("ed-dl-midi").onclick = (): void => {
    if (!rec) return;
    downloadBlob(notesToMidi(currentNotes(), { bpm: rec.bpm }), `${slug()}.mid`);
  };
  $("ed-dl-wav").onclick = (): void => {
    if (!rec) return;
    downloadBlob(encodeWav(pcm, rec.sampleRate), `${slug()}.wav`);
  };
  $("ed-dl-json").onclick = (): void => {
    const json = JSON.stringify(buildReportData(reportInput()), null, 2);
    downloadBlob(new Blob([json], { type: "application/json" }), `${slug()}.json`);
  };
  $("ed-copy-log").onclick = async (): Promise<void> => {
    const report = buildReport(reportInput());
    const log = $<HTMLTextAreaElement>("ed-log-out");
    log.value = report;
    log.hidden = false;
    try {
      await navigator.clipboard.writeText(report);
      $("ed-copy-status").textContent = "copied ✓";
    } catch {
      log.select();
      $("ed-copy-status").textContent = "select the text above to copy";
    }
  };

  void load(id, ++loadGeneration);
}

function slug(): string {
  const base = (rec?.name ?? "take")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `diapason-${base || "take"}-${Date.now()}`;
}

function deactivateEditor(): void {
  loadGeneration++;
  window.clearTimeout(persistTimer);
  stopPlayback();
  preview?.stop();
  offOutput?.();
  offOutput = null;
  document.body.classList.remove("wide");
  window.removeEventListener("resize", render);
}

export function useEditor(id: string): void {
  useEffect(() => {
    activateEditor(id);
    return deactivateEditor;
  }, [id]);
}
