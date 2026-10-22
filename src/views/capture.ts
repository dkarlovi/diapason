import { openMic, listInputDevices, type MicHandle } from "../audio";
import { createPitchDetector, type PitchDetector } from "../pitch";
import { type Frame } from "../notes";
import { drawTrace, autoRange } from "../trace";
import { createRecorder, qualityStats, type Recorder } from "../recorder";
import { startMetronome, type MetronomeHandle } from "../metronome";
import { encodeAudio } from "../codec";
import { putRecording, type Recording } from "../db";
import { loadLastTuning } from "../tuning";
import { $, show, renderChecklist, checksFor, fmtDate } from "../ui";
import { go } from "../router";

const LIVE_WINDOW_SEC = 5;

let mic: MicHandle | null = null;
let detector: PitchDetector | null = null;
let recorder: Recorder | null = null;
let metro: MetronomeHandle | null = null;
let rafId = 0;
let active = false;

let micStart = 0;
let liveFrames: Frame[] = [];
let rmsGate = 0.003;
let noiseMeasured = false;
let measuringNoise = false;
let noiseSamples: number[] = [];
let lastVerdictAt = 0;

let recording = false;
let tcap0 = 0;

const num = (id: string): number => Number(($(id) as HTMLInputElement).value);
const uid = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function refreshDevices(): Promise<void> {
  try {
    const devices = await listInputDevices();
    const sel = $<HTMLSelectElement>("cap-device");
    const prev = sel.value;
    sel.innerHTML = "";
    for (const d of devices) {
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || `Microphone ${sel.length + 1}`;
      sel.appendChild(o);
    }
    if (prev) sel.value = prev;
  } catch {
    /* labels appear only after permission */
  }
}

async function openCaptureMic(): Promise<void> {
  closeMic();
  const deviceId = $<HTMLSelectElement>("cap-device").value;
  mic = await openMic(deviceId ? { deviceId } : {});
  detector = createPitchDetector(mic.sampleRate);
  mic.setGain(num("cap-gain"));
  micStart = performance.now();
  liveFrames = [];
  await refreshDevices();
  renderDsp();
}

function closeMic(): void {
  recorder?.dispose();
  recorder = null;
  mic?.close();
  mic = null;
  detector = null;
}

function renderDsp(): void {
  if (!mic) return;
  const s = mic.getSettings() as Record<string, unknown>;
  const checks: [string, boolean][] = [
    ["echoCancellation", s.echoCancellation !== true],
    ["noiseSuppression", s.noiseSuppression !== true],
    ["autoGainControl", s.autoGainControl !== true],
  ];
  const box = $("cap-dsp");
  box.innerHTML = "";
  for (const [name, ok] of checks) {
    const b = document.createElement("span");
    b.className = `badge ${ok ? "ok" : "bad"}`;
    b.textContent = `${name}: ${ok ? "OFF ✓" : "ON ✗"}`;
    box.appendChild(b);
  }
  const r = document.createElement("span");
  r.className = "badge";
  r.textContent = `${mic.sampleRate} Hz`;
  box.appendChild(r);
}

function dspOff(): boolean {
  if (!mic) return false;
  const s = mic.getSettings() as Record<string, unknown>;
  return s.echoCancellation !== true && s.noiseSuppression !== true && s.autoGainControl !== true;
}

function refreshGate(): void {
  const ready = noiseMeasured && !recording;
  ($("cap-record") as HTMLButtonElement).disabled = !ready;
  const hint = $("cap-gate-hint");
  if (recording) hint.textContent = "";
  else if (ready)
    hint.textContent =
      "Ready — set your tempo and hit Record. (Aim for a green signal check above.)";
  else hint.textContent = "Record the room (silence) to enable recording.";
}

const meterBar = (): HTMLDivElement => $("cap-level-meter").querySelector("div") as HTMLDivElement;

function loop(): void {
  rafId = requestAnimationFrame(loop);
  if (!mic || !detector) return;
  const t = (performance.now() - micStart) / 1000;
  const buf = mic.readFrame();
  const { freq, clarity, rms } = detector(buf);

  let peak = 0;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
  meterBar().style.width = `${Math.min(100, rms * 400)}%`;
  $("cap-level-meter").classList.toggle("clip", peak > 0.98);
  $("cap-level-hint").textContent =
    peak > 0.98
      ? "⚠ Clipping — lower Input gain or move back."
      : peak < 0.08
        ? "Signal is low — raise Input gain or move closer."
        : "Good level — whistle a steady note.";

  if (measuringNoise) noiseSamples.push(rms);

  const voiced = freq !== null && rms >= rmsGate;
  liveFrames.push({ t, freq: voiced ? freq : null, clarity, rms });
  while (liveFrames.length && liveFrames[0]!.t < t - (LIVE_WINDOW_SEC + 1)) liveFrames.shift();

  const range = autoRange(liveFrames);
  drawTrace($<HTMLCanvasElement>("cap-trace"), liveFrames, {
    tMin: t - LIVE_WINDOW_SEC,
    tMax: t,
    ...range,
  });

  if (performance.now() - lastVerdictAt > 200) {
    lastVerdictAt = performance.now();
    const recent = liveFrames.filter((f) => f.t >= t - 3);
    const stats = qualityStats(recent);
    renderChecklist("cap-verdict", checksFor(stats));
  }
}

function measureRoom(): void {
  if (measuringNoise || !mic) return;
  void mic.context.resume();
  measuringNoise = true;
  noiseSamples = [];
  $("cap-noise-readout").textContent = "measuring… stay silent";
  window.setTimeout(() => {
    measuringNoise = false;
    noiseSamples.sort((a, b) => a - b);
    const p95 = noiseSamples[Math.floor(noiseSamples.length * 0.95)] ?? 0;
    rmsGate = Math.min(0.1, Math.max(0.003, p95 * 1.5));
    $("cap-noise-readout").textContent = `floor ${p95.toFixed(4)} · gate ${rmsGate.toFixed(4)} ✓`;
    noiseMeasured = true;
    refreshGate();
  }, 1500);
}

function flashBeat(beatIndex: number, beatsPerBar: number): void {
  const dot = $("cap-beatdot");
  const accent = ((beatIndex % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
  dot.classList.toggle("accent", accent);
  dot.classList.add("on");
  window.setTimeout(() => dot.classList.remove("on"), 90);
  $("cap-count").textContent = beatIndex < 0 ? String(-beatIndex) : "";
}

async function startRecording(): Promise<void> {
  if (!mic) return;
  const ctx = mic.context;
  await ctx.resume();
  if (!recorder) recorder = await createRecorder(ctx, mic.tap);
  const beatsPerBar = Math.max(1, Math.round(num("cap-beats")));
  const bpm = Math.max(40, Math.round(num("cap-bpm")));

  recorder.start();
  tcap0 = ctx.currentTime;
  recording = true;
  ($("cap-record") as HTMLButtonElement).disabled = true;
  ($("cap-stop") as HTMLButtonElement).disabled = false;
  $("cap-status").textContent = "Counting in…";
  refreshGate();

  metro = startMetronome(ctx, {
    bpm,
    beatsPerBar,
    countInBars: 1,
    onBeat: (b) => flashBeat(b, beatsPerBar),
    onDownbeat: () => {
      $("cap-status").textContent = "Recording… hit Stop when done.";
    },
  });
}

async function stopRecording(): Promise<void> {
  if (!recorder || !mic || !metro) return;
  const sr = mic.sampleRate;
  const pcm = recorder.stop();
  const downbeat = metro.downbeatTime;
  metro.stop();
  metro = null;
  recording = false;
  ($("cap-stop") as HTMLButtonElement).disabled = true;

  const drop = Math.min(pcm.length, Math.max(0, Math.round((downbeat - tcap0) * sr)));
  const trimmed = pcm.slice(drop);
  if (trimmed.length < sr * 0.3) {
    $("cap-status").textContent = "Too short — try again.";
    refreshGate();
    return;
  }
  let peak = 0;
  for (let i = 0; i < trimmed.length; i++) peak = Math.max(peak, Math.abs(trimmed[i]!));

  $("cap-status").textContent = "Saving…";
  const rec: Recording = {
    id: uid(),
    name: `Take ${fmtDate(Date.now())}`,
    createdAt: Date.now(),
    sampleRate: sr,
    durationSec: trimmed.length / sr,
    bpm: Math.max(40, Math.round(num("cap-bpm"))),
    beatsPerBar: Math.max(1, Math.round(num("cap-beats"))),
    audio: await encodeAudio(trimmed),
    capture: { gain: num("cap-gain"), peak, noiseFloor: rmsGate, dspOff: dspOff() },
    tuning: loadLastTuning(),
  };
  await putRecording(rec);
  go(`#/take/${rec.id}`);
}

export function activateCapture(): void {
  show("view-capture", true);
  active = true;
  noiseMeasured = false;
  recording = false;
  rmsGate = 0.003;
  $("cap-noise-readout").textContent = "not measured yet";
  $("cap-status").textContent = "";
  $("cap-count").textContent = "";
  renderChecklist("cap-verdict", []);

  // The AudioContext can start suspended (no direct gesture on route change); resume on
  // the first interaction so the live meter/trace actually run.
  $("view-capture").onpointerdown = (): void => void mic?.context.resume();

  $("cap-back").onclick = (): void => go("#/");
  $("cap-refresh").onclick = (): void => void refreshDevices();
  $<HTMLSelectElement>("cap-device").onchange = (): void => void openCaptureMic();
  $("cap-gain").oninput = (e): void => {
    const g = Number((e.target as HTMLInputElement).value);
    mic?.setGain(g);
    $("cap-gain-v").textContent = `${g.toFixed(1)}×`;
  };
  $("cap-noise-btn").onclick = (): void => measureRoom();
  $("cap-record").onclick = (): void => void startRecording();
  $("cap-stop").onclick = (): void => void stopRecording();

  ($("cap-record") as HTMLButtonElement).disabled = true;
  ($("cap-stop") as HTMLButtonElement).disabled = true;
  refreshGate();

  openCaptureMic()
    .then(() => active && loop())
    .catch((err) => {
      $("cap-status").textContent = `Mic error: ${(err as Error).message}`;
    });
}

export function deactivateCapture(): void {
  active = false;
  cancelAnimationFrame(rafId);
  rafId = 0;
  metro?.stop();
  metro = null;
  recording = false;
  closeMic();
  show("view-capture", false);
}
