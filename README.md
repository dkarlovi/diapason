# diapason

Whistle into your microphone and get a MIDI file out. Browser-based, fully
client-side monophonic **pitch → MIDI** — built for people who can't play an
instrument but can carry a tune by whistling.

> A *diapason* is the full tonal compass of a voice or instrument, and the
> historical name for a tuning-fork pitch reference. Fitting for a tool that
> turns your whistle into notes.

## Status: proof of concept

The POC proves the full chain works end to end:

1. **Calibrate** — pick a mic, confirm the signal is clean, measure the noise
   floor, and watch a **live scrolling pitch trace** with a pass/fail quality
   checklist so you know what "good" looks like. You can also record a few short
   **samples** and re-run detection on them (with replay) to tune without
   whistling continuously.
2. **Capture** — record a whistled melody with live note feedback.
3. **Export** — review the detected notes and download a `.mid` you can import
   into [BandLab](https://bandlab.com) or any DAW.

## Why calibration comes first

The single biggest failure mode for browser whistle-detection is that
`getUserMedia` applies **echo cancellation, noise suppression, and auto gain
control** by default. For speech that's helpful; for a pure whistle tone it's
ruinous — noise suppression treats the steady tone as noise and gates it, and
auto-gain pumps the level up and down. That's the "distortion."

diapason requests a **raw** audio stream with all three disabled, and the
calibration screen shows you their actual state (`OFF ✓`) plus a live level
meter, a clipping warning, and a live pitch test, so you can confirm the signal
is good *before* recording.

## Running it

Requires Node 22+.

```bash
npm install
npm run dev      # opens http://localhost:5173
```

Microphone access needs a secure context; `localhost` qualifies, so the plain
Vite dev server works without HTTPS.

Other scripts:

```bash
npm run build     # typecheck (tsc) + production build to dist/
npm run preview   # serve the production build
npm run typecheck # tsc --noEmit only
```

## How it works

| Stage | File | Notes |
|-------|------|-------|
| Mic capture (raw, DSP off) | `src/audio.ts` | `getUserMedia` + `AnalyserNode` |
| Pitch detection | `src/pitch.ts` | McLeod / NSDF, band-limited to whistle range |
| Note mapping + segmentation | `src/notes.ts` | Hz→MIDI, median-filter, onset/offset heuristics |
| PCM recorder + offline analysis | `src/recorder.ts` | AudioWorklet capture, re-analyze buffers, quality stats |
| Pitch-trace visualization | `src/trace.ts` | Canvas 2D pitch-over-time renderer |
| WAV encoder | `src/wav.ts` | Mono 16-bit PCM WAV for offline inspection |
| Diagnostics report | `src/diagnostics.ts` | Structured (.json) + text report of a sample |
| MIDI file writer | `src/midi.ts` | Standard MIDI File (Type 0), no deps |
| UI / state machine | `src/main.ts` | calibrate → capture → export |

The sample recorder captures contiguous raw PCM (not compressed audio), which
is why detection on a recorded sample matches live detection exactly — and it's
the foundation for future WAV/MP3 file input.

### Inspecting / tuning detection

Each recorded sample can be exported from the **Inspect** panel:

- **Download .wav** — the raw captured audio (mono 16-bit PCM), the ground truth
  for offline analysis.
- **Download .json** — the metrics: config (band, clarity threshold, noise gate),
  quality stats, the segmented notes, and the full per-frame pitch track.
- **Copy log** — the same report as compact text, for pasting inline.

Together these let detection be debugged without being at the mic.

### Tuning panel

A **Tuning** section exposes the segmentation parameters as live sliders —
stickiness (hysteresis), min note length, silence gap, change debounce,
smoothing, clarity gate, and level gate. Changes apply **instantly** to the
inspected sample (its note list re-computes as you drag) and to capture, so you
can dial in the behaviour without editing code. "Record the room" pushes the
measured floor into the Level-gate slider. Sliders read/write through a single
`readTuning()` → `SegmentOptions`, so named presets can be layered on later.

Pitch detection is deliberately **band-limited** (~250–4000 Hz) to the whistle
range: it's cheaper and rejects the octave errors that plague wide-range
detectors.

## Known limitations (POC)

- **Repeated same-pitch notes** that are slurred together (no silence between)
  merge into one note. Proper re-articulation detection via amplitude dips is a
  planned improvement.
- **Sticky note tracking** tolerates drift/vibrato up to ±0.9 semitone within a
  held note (`hysteresisSemitones`), so wandering tones stay one note. The
  trade-off: two *intended* notes less than ~1 semitone apart, whistled with
  drift, may merge. Tune `hysteresisSemitones` down if you sing very precise,
  closely-spaced intervals.
- **No rhythm quantization yet** — note lengths are the raw durations you
  whistled. Tempo is only used for the seconds→ticks conversion on export.
- **Live capture only** — file upload is a planned addition.
- **Vibrato / pitch wobble** is smoothed with a median filter but can still
  nudge borderline notes across a semitone boundary.

## Roadmap ideas

- Amplitude-based onset detection for repeated notes
- Tempo estimation + quantization to a grid
- WAV/MP3 file input
- Scale snapping (constrain output to a chosen key)
- Direct MIDI-out via Web MIDI instead of file download
