import { openMic, listInputDevices, type MicHandle } from './audio';
import { createPitchDetector, type PitchDetector } from './pitch';
import { centsOff, midiToName, segmentNotes, type Frame, type NoteEvent, type SegmentOptions } from './notes';
import { notesToMidi } from './midi';
import {
  createRecorder,
  analyzeBuffer,
  qualityStats,
  ANALYZE_DEFAULTS,
  type Recorder,
  type QualityStats,
} from './recorder';
import { PITCH_DEFAULTS } from './pitch';
import { drawTrace, autoRange } from './trace';
import { buildReport, buildReportData, type ReportInput } from './diagnostics';
import { encodeWav } from './wav';

// --- tiny DOM helpers -------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};
const show = (id: string, visible: boolean): void => {
  $(id).hidden = !visible;
};
const btn = (id: string): HTMLButtonElement => $<HTMLButtonElement>(id);

// --- elements ---------------------------------------------------------------
const deviceSel = $<HTMLSelectElement>('device');
const levelMeter = $('level-meter');
const levelBar = levelMeter.querySelector('div') as HTMLDivElement;
const liveTrace = $<HTMLCanvasElement>('live-trace');
const sampleTrace = $<HTMLCanvasElement>('sample-trace');

// --- state ------------------------------------------------------------------
let mic: MicHandle | null = null;
let detector: PitchDetector | null = null;
let recorder: Recorder | null = null;
let rafId = 0;
let mode: 'calibrate' | 'capture' | null = null;
let micStart = 0;

let rmsGate = 0.01;
let measuringNoise = false;
let noiseSamples: number[] = [];

const LIVE_WINDOW_SEC = 5;
let liveFrames: Frame[] = []; // ring buffer of recent live frames
let lastVoiced: { name: string; freq: number; cents: number; clarity: number; t: number } | null =
  null;
let lastVerdictAt = 0;
let goodSignalSeen = false;
let noiseMeasured = false;

interface Sample {
  id: number;
  name: string;
  samples: Float32Array;
  sampleRate: number;
  frames: Frame[];
  stats: QualityStats;
}
let samples: Sample[] = [];
let sampleSeq = 0;
let activeSampleId: number | null = null;
let playbackCtx: AudioContext | null = null;

let recording = false; // capture-mode recording
let captureStart = 0;
let captureFrames: Frame[] = [];
let lastEvents: NoteEvent[] = [];

// --- device list ------------------------------------------------------------
async function refreshDevices(): Promise<void> {
  try {
    const devices = await listInputDevices();
    deviceSel.innerHTML = '';
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${deviceSel.length + 1}`;
      deviceSel.appendChild(opt);
    }
    if (!devices.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Default microphone';
      deviceSel.appendChild(opt);
    }
  } catch {
    /* labels appear only after permission is granted; harmless before then */
  }
}

// --- mic lifecycle ----------------------------------------------------------
async function startMic(): Promise<void> {
  stopMic();
  mic = await openMic(deviceSel.value ? { deviceId: deviceSel.value } : {});
  detector = createPitchDetector(mic.sampleRate);
  micStart = performance.now();
  liveFrames = [];
  lastVoiced = null;
  goodSignalSeen = false;
  noiseMeasured = false;
  $('noise-readout').textContent = 'not measured yet';
  refreshCaptureGate();
  mic.setGain(Number(($('gain') as HTMLInputElement).value) || 1);
  await refreshDevices();
  renderDspStatus();
}

function stopMic(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
  recorder?.dispose();
  recorder = null;
  mic?.close();
  mic = null;
  detector = null;
}

function renderDspStatus(): void {
  if (!mic) return;
  const s = mic.getSettings() as Record<string, unknown>;
  const checks: [string, boolean][] = [
    ['echoCancellation', s.echoCancellation === false || s.echoCancellation === undefined],
    ['noiseSuppression', s.noiseSuppression === false || s.noiseSuppression === undefined],
    ['autoGainControl', s.autoGainControl === false || s.autoGainControl === undefined],
  ];
  const box = $('dsp-status');
  box.innerHTML = '';
  for (const [name, ok] of checks) {
    const b = document.createElement('span');
    b.className = `badge ${ok ? 'ok' : 'bad'}`;
    b.textContent = `${name}: ${ok ? 'OFF ✓' : 'ON ✗'}`;
    box.appendChild(b);
  }
  const rate = document.createElement('span');
  rate.className = 'badge';
  rate.textContent = `${mic.sampleRate} Hz`;
  box.appendChild(rate);
}

// --- verdict checklist ------------------------------------------------------
interface Check {
  label: string;
  pass: boolean;
  detail: string;
}

function checksFor(stats: QualityStats): Check[] {
  return [
    {
      label: 'Signal detected',
      pass: stats.voicedRatio >= 0.25,
      detail: `${Math.round(stats.voicedRatio * 100)}% voiced`,
    },
    {
      label: 'Clear tone',
      pass: stats.medianClarity >= 0.9,
      detail: `clarity ${stats.medianClarity.toFixed(2)}`,
    },
    { label: 'No clipping', pass: !stats.clipped, detail: `peak ${stats.peak.toFixed(2)}` },
    {
      label: 'Steady pitch',
      pass: stats.centsStd <= 20 && stats.voicedRatio >= 0.25,
      detail: `±${stats.centsStd.toFixed(0)}¢`,
    },
  ];
}

function renderChecklist(id: string, checks: Check[]): void {
  const ul = $(id);
  ul.innerHTML = '';
  for (const c of checks) {
    const li = document.createElement('li');
    li.className = c.pass ? 'pass' : c.detail ? 'fail' : '';
    li.innerHTML = `<span class="dot"></span><span>${c.label}</span><span class="detail">${c.detail}</span>`;
    ul.appendChild(li);
  }
}

// A verdict is "good enough to capture" when there's a clear, non-clipping signal.
function passesCore(checks: Check[]): boolean {
  return checks[0]!.pass && checks[1]!.pass && checks[2]!.pass;
}

// --- live analysis loop -----------------------------------------------------
function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (!mic || !detector) return;

  const t = (performance.now() - micStart) / 1000;
  const buf = mic.readFrame();
  const { freq, clarity, rms } = detector(buf);

  // Level meter + clip detection.
  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
  levelBar.style.width = `${Math.min(100, rms * 400)}%`;
  levelMeter.classList.toggle('clip', peak > 0.98);

  if (mode === 'calibrate') {
    const hint = $('level-hint');
    if (peak > 0.98) hint.textContent = '⚠ Clipping — lower Input gain or move back from the mic.';
    else if (peak < 0.08)
      hint.textContent = 'Signal is low — raise Input gain or move closer (pitch still works, this just helps levels).';
    else hint.textContent = 'Good level — whistle a steady note.';
  }

  if (measuringNoise) noiseSamples.push(rms);

  const voiced = freq !== null && rms >= rmsGate;
  const frame: Frame = { t, freq: voiced ? freq : null, clarity, rms };

  if (mode === 'capture' && recording) {
    captureFrames.push({ ...frame, t: (performance.now() - captureStart) / 1000 });
  }

  // Maintain live ring buffer (last few seconds).
  liveFrames.push(frame);
  const cutoff = t - (LIVE_WINDOW_SEC + 1);
  while (liveFrames.length && liveFrames[0]!.t < cutoff) liveFrames.shift();

  // Note-hold so the readout doesn't flicker frame-to-frame.
  if (voiced && freq !== null) {
    lastVoiced = { name: midiToName(freqRound(freq)), freq, cents: centsOff(freq), clarity, t };
  }

  if (mode === 'calibrate') drawCalibration(t);
  else if (mode === 'capture') drawCapture(voiced, freq);
}

function freqRound(freq: number): number {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

function drawCalibration(t: number): void {
  // Scrolling trace.
  const range = autoRange(liveFrames);
  drawTrace(liveTrace, liveFrames, {
    tMin: t - LIVE_WINDOW_SEC,
    tMax: t,
    midiMin: range.midiMin,
    midiMax: range.midiMax,
  });

  // Note-hold readout (hold ~250ms past last voiced frame).
  const held = lastVoiced && t - lastVoiced.t < 0.25 ? lastVoiced : null;
  const note = $('pitch-note');
  const sub = $('pitch-sub');
  if (held) {
    note.className = 'readout';
    note.style.fontSize = '2rem';
    note.textContent = held.name;
    sub.textContent = `${held.freq.toFixed(1)} Hz · ${held.cents >= 0 ? '+' : ''}${held.cents}¢`;
  } else {
    note.className = 'readout idle';
    note.textContent = '—';
    sub.textContent = 'whistle to test';
  }

  // Throttle the checklist so it doesn't thrash.
  if (performance.now() - lastVerdictAt > 200) {
    lastVerdictAt = performance.now();
    const recent = liveFrames.filter((f) => f.t >= t - 3);
    const stats = qualityStats(recent);
    const checks = checksFor(stats);
    const roomCheck: Check = {
      label: 'Room noise measured',
      pass: noiseMeasured,
      detail: noiseMeasured ? `gate ${rmsGate.toFixed(4)}` : 'record the room',
    };
    renderChecklist('live-verdict', [...checks, roomCheck]);
    if (passesCore(checks)) markGood();
  }
}

function drawCapture(voiced: boolean, freq: number | null): void {
  const note = $('capture-note');
  if (voiced && freq !== null) {
    note.className = 'readout';
    note.textContent = midiToName(freqRound(freq));
  } else {
    note.className = 'readout idle';
    note.textContent = '—';
  }
}

function markGood(): void {
  if (goodSignalSeen) return;
  goodSignalSeen = true;
  refreshCaptureGate();
}

// Capture is gated on BOTH a clean signal and a measured room (silence floor).
function refreshCaptureGate(): void {
  const ready = goodSignalSeen && noiseMeasured;
  btn('btn-to-capture').disabled = !ready;
  const hint = $('gate-hint');
  if (ready) {
    hint.textContent = 'Ready — whistle a steady note and continue.';
  } else if (!noiseMeasured && !goodSignalSeen) {
    hint.textContent = 'Record the room and get a clean signal to continue.';
  } else if (!noiseMeasured) {
    hint.textContent = 'Record the room (silence) to continue.';
  } else {
    hint.textContent = 'Whistle a steady, clear note to continue.';
  }
}

// --- calibration actions ----------------------------------------------------
btn('btn-refresh').addEventListener('click', () => void refreshDevices());

$('gain').addEventListener('input', (e) => {
  const g = Number((e.target as HTMLInputElement).value);
  mic?.setGain(g);
  $('gain-val').textContent = `${g.toFixed(1)}×`;
});

// --- tuning panel -----------------------------------------------------------
const TUNING_IDS = ['t-sticky', 't-minlen', 't-silence', 't-debounce', 't-smooth', 't-clarity', 't-gate'] as const;
const TUNING_DEFAULTS: Record<string, string> = {
  't-sticky': '0.4',
  't-minlen': '80',
  't-silence': '90',
  't-debounce': '60',
  't-smooth': '5',
  't-clarity': '0.9',
  't-gate': '0.003',
};

const tnum = (id: string): number => Number(($(id) as HTMLInputElement).value);

// Read the sliders into SegmentOptions. One source of truth for sample + capture.
function readTuning(): SegmentOptions {
  return {
    hysteresisSemitones: tnum('t-sticky'),
    minDurationSec: tnum('t-minlen') / 1000,
    silenceGapSec: tnum('t-silence') / 1000,
    changeDebounceSec: tnum('t-debounce') / 1000,
    medianWindow: tnum('t-smooth'),
    clarityThreshold: tnum('t-clarity'),
    rmsGate: tnum('t-gate'),
  };
}

function refreshTuningLabels(): void {
  $('t-sticky-v').textContent = `±${(0.5 + tnum('t-sticky')).toFixed(2)} st`;
  $('t-minlen-v').textContent = `${tnum('t-minlen')} ms`;
  $('t-silence-v').textContent = `${tnum('t-silence')} ms`;
  $('t-debounce-v').textContent = `${tnum('t-debounce')} ms`;
  $('t-smooth-v').textContent = `${tnum('t-smooth')} fr`;
  $('t-clarity-v').textContent = tnum('t-clarity').toFixed(3);
  $('t-gate-v').textContent = tnum('t-gate').toFixed(3);
}

function onTuningChange(): void {
  refreshTuningLabels();
  rmsGate = tnum('t-gate'); // keep the live-loop gate in sync with the slider
  if (activeSampleId !== null) inspectSample(activeSampleId); // re-segment live
}

for (const id of TUNING_IDS) $(id).addEventListener('input', onTuningChange);
btn('btn-reset-tuning').addEventListener('click', () => {
  for (const id of TUNING_IDS) ($(id) as HTMLInputElement).value = TUNING_DEFAULTS[id]!;
  onTuningChange();
});

function renderNoteTable(elId: string, notes: NoteEvent[]): void {
  const rows = notes
    .map(
      (e, i) =>
        `<tr><td>${i + 1}</td><td>${e.name}</td><td>${e.start.toFixed(2)}s</td><td>${e.duration.toFixed(2)}s</td></tr>`,
    )
    .join('');
  $(elId).innerHTML = `<table>
    <thead><tr><th>#</th><th>Note</th><th>Start</th><th>Length</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4">No notes — adjust tuning or re-record.</td></tr>'}</tbody>
  </table>`;
}

btn('btn-calibrate').addEventListener('click', async () => {
  const log = $('calib-log');
  log.className = 'log';
  log.textContent = 'Requesting microphone…';
  try {
    await startMic();
    mode = 'calibrate';
    show('calib-body', true);
    btn('btn-calibrate').disabled = true;
    btn('btn-stop-calibrate').disabled = false;
    log.textContent = '';
    loop();
  } catch (err) {
    log.className = 'log err';
    log.textContent = `Mic error: ${(err as Error).message}`;
  }
});

btn('btn-stop-calibrate').addEventListener('click', () => {
  stopMic();
  mode = null;
  show('calib-body', false);
  btn('btn-calibrate').disabled = false;
  btn('btn-stop-calibrate').disabled = true;
});

btn('btn-noise').addEventListener('click', () => {
  if (measuringNoise || !mic) return;
  measuringNoise = true;
  noiseSamples = [];
  $('noise-readout').textContent = 'measuring… stay silent';
  window.setTimeout(() => {
    measuringNoise = false;
    noiseSamples.sort((a, b) => a - b);
    const p95 = noiseSamples[Math.floor(noiseSamples.length * 0.95)] ?? 0;
    // Low floor + modest multiplier: whistles stay clear even when quiet, so we lean on
    // clarity for voicing rather than an aggressive absolute level gate.
    rmsGate = Math.min(0.1, Math.max(0.003, p95 * 1.5));
    // Push the measured floor into the Level-gate slider so it's visible and tweakable.
    ($('t-gate') as HTMLInputElement).value = String(Math.round(rmsGate * 1000) / 1000);
    refreshTuningLabels();
    $('noise-readout').textContent = `floor ${p95.toFixed(4)} · gate ${rmsGate.toFixed(4)} ✓`;
    noiseMeasured = true;
    refreshCaptureGate();
    if (activeSampleId !== null) inspectSample(activeSampleId);
  }, 1500);
});

btn('btn-to-capture').addEventListener('click', () => {
  mode = 'capture';
  show('sec-calibrate', false);
  show('sec-capture', true);
  show('sec-results', false);
});

// --- sample bank ------------------------------------------------------------
btn('btn-rec-sample').addEventListener('click', async () => {
  if (!mic) return;
  const b = btn('btn-rec-sample');
  if (!recorder) recorder = await createRecorder(mic.context, mic.tap);
  const secs = clampSecs(Number(($('sample-secs') as HTMLInputElement).value));
  b.disabled = true;
  const hint = $('sample-hint');
  recorder.start();
  for (let left = secs; left >= 1; left--) {
    hint.textContent = `recording… ${left}`;
    await sleep(1000);
  }
  const pcm = recorder.stop();
  hint.textContent = `${samples.length + 1} sample(s)`;
  b.disabled = false;
  addSample(pcm, mic.sampleRate);
});

function addSample(pcm: Float32Array, sampleRate: number): void {
  const frames = analyzeBuffer(pcm, sampleRate);
  const stats = qualityStats(frames, pcm);
  const s: Sample = {
    id: ++sampleSeq,
    name: `Sample ${sampleSeq}`,
    samples: pcm,
    sampleRate,
    frames,
    stats,
  };
  samples.push(s);
  renderSampleList();
  inspectSample(s.id);
  if (passesCore(checksFor(stats))) markGood();
}

function renderSampleList(): void {
  const list = $('sample-list');
  list.innerHTML = '';
  for (const s of samples) {
    const good = passesCore(checksFor(s.stats));
    const row = document.createElement('div');
    row.className = `sample${s.id === activeSampleId ? ' active' : ''}`;
    row.innerHTML = `
      <span class="name">${s.name}</span>
      <span class="meta">${(s.samples.length / s.sampleRate).toFixed(1)}s</span>
      <span class="pill ${good ? 'good' : 'meh'}">${good ? 'clean' : 'check'}</span>
      <span class="spacer"></span>`;
    const inspect = mkBtn('Inspect', () => inspectSample(s.id));
    const play = mkBtn('▶', () => void playSample(s));
    const del = mkBtn('✕', () => removeSample(s.id));
    row.append(inspect, play, del);
    list.appendChild(row);
  }
  if (!samples.length) $('sample-hint').textContent = 'no samples yet';
}

function mkBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function inspectSample(id: number): void {
  const s = samples.find((x) => x.id === id);
  if (!s) return;
  activeSampleId = id;
  renderSampleList();
  show('sample-inspect', true);
  $('sample-inspect-label').textContent = `${s.name} — detection trace`;
  const range = autoRange(s.frames);
  const dur = s.samples.length / s.sampleRate;
  drawTrace(sampleTrace, s.frames, { tMin: 0, tMax: dur, ...range });
  renderChecklist('sample-verdict', checksFor(s.stats));
  const notes = segmentNotes(s.frames, readTuning());
  $('sample-notes').textContent = `${notes.length} notes with current tuning`;
  renderNoteTable('sample-note-list', notes);
  ($('log-out') as HTMLTextAreaElement).value = '';
  $('copy-status').textContent = '';
}

function removeSample(id: number): void {
  samples = samples.filter((x) => x.id !== id);
  if (activeSampleId === id) {
    activeSampleId = null;
    show('sample-inspect', false);
  }
  renderSampleList();
}

async function playSample(s: Sample): Promise<void> {
  if (!playbackCtx) playbackCtx = new AudioContext();
  if (playbackCtx.state === 'suspended') await playbackCtx.resume();
  const buf = playbackCtx.createBuffer(1, s.samples.length, s.sampleRate);
  buf.copyToChannel(s.samples as Float32Array<ArrayBuffer>, 0);
  const src = playbackCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playbackCtx.destination);
  src.start();
}

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

function clampSecs(v: number): number {
  if (!Number.isFinite(v)) return 5;
  return Math.max(1, Math.min(20, Math.round(v)));
}

const activeSample = (): Sample | undefined => samples.find((x) => x.id === activeSampleId);

function reportInputFor(s: Sample): ReportInput {
  return {
    title: s.name,
    sampleRate: s.sampleRate,
    durationSec: s.samples.length / s.sampleRate,
    windowSize: ANALYZE_DEFAULTS.windowSize,
    hop: ANALYZE_DEFAULTS.hop,
    detector: {
      minFreq: PITCH_DEFAULTS.minFreq,
      maxFreq: PITCH_DEFAULTS.maxFreq,
      clarityThreshold: PITCH_DEFAULTS.clarityThreshold,
    },
    rmsGate,
    frames: s.frames,
    stats: s.stats,
  };
}

const slug = (s: Sample): string =>
  `diapason-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

btn('btn-copy-log').addEventListener('click', async () => {
  const s = activeSample();
  const status = $('copy-status');
  if (!s) {
    status.textContent = 'no sample selected';
    return;
  }
  const report = buildReport(reportInputFor(s));
  ($('log-out') as HTMLTextAreaElement).value = report;
  try {
    await navigator.clipboard.writeText(report);
    status.textContent = 'copied to clipboard ✓';
  } catch {
    // Clipboard API can be blocked; the textarea is the fallback.
    ($('log-out') as HTMLTextAreaElement).select();
    status.textContent = 'copy failed — select the text above and copy manually';
  }
});

btn('btn-dl-wav').addEventListener('click', () => {
  const s = activeSample();
  if (!s) return;
  downloadBlob(encodeWav(s.samples, s.sampleRate), `${slug(s)}.wav`);
  $('copy-status').textContent = 'saved .wav ✓';
});

btn('btn-dl-json').addEventListener('click', () => {
  const s = activeSample();
  if (!s) return;
  const json = JSON.stringify(buildReportData(reportInputFor(s)), null, 2);
  downloadBlob(new Blob([json], { type: 'application/json' }), `${slug(s)}.json`);
  $('copy-status').textContent = 'saved .json ✓';
});

// --- capture actions --------------------------------------------------------
btn('btn-record').addEventListener('click', () => {
  captureFrames = [];
  captureStart = performance.now();
  recording = true;
  btn('btn-record').disabled = true;
  btn('btn-stop-record').disabled = false;
  $('capture-log').textContent = 'Recording…';
});

btn('btn-stop-record').addEventListener('click', () => {
  recording = false;
  btn('btn-record').disabled = false;
  btn('btn-stop-record').disabled = true;
  $('capture-log').textContent = '';
  lastEvents = segmentNotes(captureFrames, readTuning());
  renderResults();
  show('sec-results', true);
});

btn('btn-back').addEventListener('click', () => {
  mode = 'calibrate';
  show('sec-capture', false);
  show('sec-calibrate', true);
});

function renderResults(): void {
  const dur = captureFrames.length ? captureFrames[captureFrames.length - 1]!.t : 0;
  $('results-summary').textContent = `${lastEvents.length} notes over ${dur.toFixed(1)}s (gate ${rmsGate.toFixed(4)}).`;
  renderNoteTable('note-list', lastEvents);
}

btn('btn-download').addEventListener('click', () => {
  if (!lastEvents.length) return;
  const bpm = Number(($('bpm') as HTMLInputElement).value) || 120;
  const blob = notesToMidi(lastEvents, { bpm });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `diapason-${Date.now()}.mid`;
  a.click();
  URL.revokeObjectURL(url);
});

btn('btn-again').addEventListener('click', () => {
  show('sec-results', false);
  $('capture-note').textContent = '—';
});

// --- boot -------------------------------------------------------------------
refreshTuningLabels();
rmsGate = tnum('t-gate');
void refreshDevices();
