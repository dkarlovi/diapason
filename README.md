# diapason

Whistle into your microphone and get a MIDI file out. Browser-based, fully
client-side monophonic **pitch → MIDI** — built for people who can't play an
instrument but can carry a tune by whistling.

> A _diapason_ is the full tonal compass of a voice or instrument, and the
> historical name for a tuning-fork pitch reference. Fitting for a tool that
> turns your whistle into notes.

## A takes studio

diapason is organized as a **library of takes**, persisted in your browser
(IndexedDB) so a refresh never loses them. Three views, routed by URL path:

1. **Library** (`/diapason/`) — your recordings. Open / duplicate / delete.
2. **Capture** (`/diapason/new`) — full signal calibration (device, gain, raw-audio
   check, record the room) → set **tempo**, get a **count-in + audible
   metronome**, and record on the downbeat. The take is saved and opens in the
   editor. The metronome click is removed from pitch detection automatically
   (its beat times are known, so those windows are skipped — the stored audio
   stays untouched).
3. **Editor** (`/diapason/take/:id`) — all post-processing on a take: pitch trace,
   **per-recording tuning** sliders (saved with the take), live note list,
   **tempo-aware quantization**, and exports (`.mid` / `.wav` / `.json` / log).

Audio is stored as **gzipped Int16 PCM** (lossless, browser-native
`CompressionStream`, no dependencies). Downloads are lossless WAV.

## Why calibration comes first

The single biggest failure mode for browser whistle-detection is that
`getUserMedia` applies **echo cancellation, noise suppression, and auto gain
control** by default. For speech that's helpful; for a pure whistle tone it's
ruinous — noise suppression treats the steady tone as noise and gates it, and
auto-gain pumps the level up and down. That's the "distortion."

diapason requests a **raw** audio stream with all three disabled, and the
calibration screen shows you their actual state (`OFF ✓`) plus a live level
meter, a clipping warning, and a live pitch test, so you can confirm the signal
is good _before_ recording.

## Running it

Requires Node 22+.

```bash
npm install
npm run dev      # opens http://localhost:5173/diapason/
```

Microphone access needs a secure context; `localhost` qualifies, so the plain
Vite dev server works without HTTPS.

Other scripts:

```bash
npm run build     # typecheck (tsc) + production build to dist/
npm run preview   # serve the production build
npm run typecheck # tsc --noEmit only
npm test          # Vitest regression tests
npm run lint      # oxlint
npm run format    # oxfmt
npm run format:check # verify formatting
```

## Deployment

GitHub Actions builds and typechecks pull requests. Pushes to `main` (or a manual
workflow run) also deploy `dist/` to <https://dkarlovi.github.io/diapason/>.
GitHub Pages must use **GitHub Actions** as its publishing source in the
repository's **Settings → Pages**. The workflow uses Node 22 and `npm ci` with
the committed lockfile; no deployment secrets are needed.

Vite's base path is `/diapason/` so built assets load from the project URL.
The build copies `index.html` to `404.html` so direct links to capture and editor routes work on GitHub Pages.

## How it works

| Stage                           | File                                            | Notes                                                   |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Mic capture (raw, DSP off)      | `src/audio.ts`                                  | `getUserMedia` + `AnalyserNode`                         |
| Pitch detection                 | `src/pitch.ts`                                  | McLeod / NSDF, band-limited to whistle range            |
| Note mapping + segmentation     | `src/notes.ts`                                  | Hz→MIDI, median-filter, onset/offset heuristics         |
| PCM recorder + offline analysis | `src/recorder.ts`                               | AudioWorklet capture, re-analyze buffers, quality stats |
| Pitch-trace visualization       | `src/trace.ts`                                  | Canvas 2D pitch-over-time renderer                      |
| WAV encoder                     | `src/wav.ts`                                    | Mono 16-bit PCM WAV for offline inspection              |
| Diagnostics report              | `src/diagnostics.ts`                            | Structured (.json) + text report of a sample            |
| MIDI file writer                | `src/midi.ts`                                   | Standard MIDI File (Type 0), no deps                    |
| Metronome                       | `src/metronome.ts`                              | Count-in + audible click, AudioContext-scheduled        |
| Tempo quantization              | `src/quantize.ts`                               | Snap note start/length to a beat grid                   |
| Storage codec                   | `src/codec.ts`                                  | Float32↔Int16, gzip via `CompressionStream`             |
| IndexedDB library               | `src/db.ts`                                     | Persisted takes (no deps)                               |
| Per-take tuning                 | `src/tuning.ts`                                 | Defaults + last-used persistence                        |
| Path router                     | `src/main.tsx`, `src/router.ts`                 | React Router and route helpers                          |
| Screens and hooks               | `src/components/*.tsx`, `src/hooks/*.ts`        | React rendering and screen behavior                     |
| Shared UI + entry               | `src/components/primitives.tsx`, `src/main.tsx` | controls and app root                                   |

The recorder captures contiguous raw PCM via an AudioWorklet; detection re-runs
deterministically when a take is opened, so the editor always reflects the
current code and tuning.

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
  trade-off: two _intended_ notes less than ~1 semitone apart, whistled with
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
