# diapason

Whistle into your microphone and get a MIDI file out. Browser-based, fully
client-side monophonic **pitch → MIDI** — built for people who can't play an
instrument but can carry a tune by whistling.

> A _diapason_ is the full tonal compass of a voice or instrument, and the
> historical name for a tuning-fork pitch reference. Fitting for a tool that
> turns your whistle into notes.

## A recording studio

diapason is organized as a **library of recordings**, persisted in your browser
(IndexedDB) so a refresh never loses them. Three views, routed by URL path:

1. **Library** (`/diapason/`) — your recordings. Preview audio or MIDI,
   open, duplicate, or delete.
2. **New recording** (`/diapason/new`) — a guided setup: choose your sound →
   connect and verify your microphone → measure room noise → check your sound →
   find your tempo → record. Set tempo by tapping a button/Space, clapping into
   the microphone, or entering BPM. Preview the metronome and choose beats per
   bar, then confirm. One bar counts you in before recording starts on the downbeat.
   The saved recording opens in the editor. The metronome guides your timing; its beat schedule never blanks captured
   pitches. Stored audio stays untouched.
3. **Editor** (`/diapason/recording/:id`) — all post-processing on a recording: pitch trace,
   **per-recording tuning** sliders (saved with the recording), an interactive
   MIDI piano roll, audio/MIDI playback, **tempo-aware quantization**, and
   exports (`.mid` / `.wav` / `.json` / log). Click a note to preview it;
   Ctrl/Cmd+click to mute or unmute it for playback and MIDI export.

New recordings preserve detected timing by default. Optional quantization offers
quarter notes, eighth notes, sixteenth notes, and eighth-note triplets. It snaps
notes where possible while preserving their order: when a grid would collapse
distinct onsets, the affected notes keep their original onsets. Short notes retain
their length, and note ends are limited by the next onset to prevent overlaps.
Existing saved grid settings remain in effect; legacy recordings without an
explicit setting retain their eighth-note default.
The header's **MIDI out** picker routes note playback to the browser synth or an
external synth/DAW via Web MIDI when supported and permitted. Browser playback
offers instrument sounds and an octave shift; these playback settings do not
change the exported MIDI file.

Audio is stored as **gzipped Int16 PCM** (lossless, browser-native
`CompressionStream`, no dependencies). Downloads are lossless WAV.

## Why calibration comes first

The single biggest failure mode for browser whistle-detection is that
`getUserMedia` applies **echo cancellation, noise suppression, and auto gain
control** by default. For speech that's helpful; for a pure whistle tone it's
ruinous — noise suppression treats the steady tone as noise and gates it, and
auto-gain pumps the level up and down. That's the "distortion."

diapason requests a **raw** audio stream with all three disabled. Setup uses the
same status rows for audio settings, low room noise, and usable sound. Settings
that the browser cannot report are shown as unknown and require acknowledgment.

The live monitor combines input level, clipping warnings, pitch, and scrolling
beat/bar lines. Calibration results stay passed after you stop sounding. Changing
microphone or gain requires fresh room and sound checks; changing tempo preserves
calibration. Gain remains available while fixing a failed room measurement.

Whistling is currently the supported sound source. Source profiles store effective
analysis settings with each new recording, preparing for future humming and
instrument support. These future choices are not yet offered. The detector is
monophonic; mixed music and chords are outside its current scope.

Clap listening is explicitly started and stops before metronome preview or
recording. It requires AudioWorklet support; tapping and numeric input remain
available if microphone tempo detection fails. Microphone access needs localhost
or HTTPS. Audio and recordings remain local in IndexedDB.

## Running it

Requires Node 22+.

```bash
npm ci
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
npm run dupes     # Fallow semantic/near-miss duplicate check
npm run audit     # Fallow dead code, complexity, duplication, and styling review
npm run metrics   # advisory health scores, hotspots, and refactoring targets
npm run format    # oxfmt
npm run format:check # verify formatting
npm run check     # typecheck + lint + format check + Fallow + tests + build
```

The duplication check normalizes renamed variables and changed literals. Its baseline
is empty; new matches fail the check. Fallow's separate model-backed `similar-code` command can
suggest functions with different structures for manual review, but is not a CI gate.
The audit also blocks new dead code and complexity findings. Its health baseline
records five existing complexity hotspots and one coverage-aware risk finding for
later refactoring; CSS findings
are advisory while styling work is pending. The metrics report remains visible
in local checks and CI without blocking on existing hotspots. Fallow compares
baseline growth with `origin/main`; audit compares with `HEAD^`, the base of
GitHub's pull request merge commit and the previous `main` commit after merge.
Run checks from a Git checkout with both refs available.

## Deployment

GitHub Actions runs `npm run check` on pull requests. Pushes to `main` (or a manual
workflow run) also deploy `dist/` to <https://dkarlovi.github.io/diapason/>.
GitHub Pages must use **GitHub Actions** as its publishing source in the
repository's **Settings → Pages**. The workflow uses Node 22 and `npm ci` with
the committed lockfile; no deployment secrets are needed.
To block merges until checks pass, require the `build` job in the `main` branch protection rule.

Vite's base path is `/diapason/` so built assets load from the project URL.
The build copies `index.html` to `404.html` so direct links to capture and editor routes work on GitHub Pages.

## How it works

| Stage                           | File                                            | Notes                                                           |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Mic capture (raw, DSP off)      | `src/audio.ts`                                  | `getUserMedia` + `AnalyserNode`                                 |
| Pitch detection                 | `src/pitch.ts`                                  | McLeod / NSDF, band-limited to whistle range                    |
| Note mapping + segmentation     | `src/notes.ts`                                  | Hz→MIDI, median-filter, onset/offset heuristics                 |
| PCM recorder + offline analysis | `src/recorder.ts`                               | AudioWorklet capture, re-analyze buffers, quality stats         |
| Pitch-trace visualization       | `src/trace.ts`                                  | Canvas 2D pitch-over-time renderer                              |
| WAV encoder                     | `src/wav.ts`                                    | Mono 16-bit PCM WAV for offline inspection                      |
| Diagnostics report              | `src/diagnostics.ts`                            | Structured (.json) + text report of a sample                    |
| MIDI file writer                | `src/midi.ts`                                   | Standard MIDI File (Type 0), no deps                            |
| Metronome                       | `src/metronome.ts`                              | Count-in + audible click, AudioContext-scheduled                |
| Tempo quantization              | `src/quantize.ts`                               | Snap note start/length to a beat grid                           |
| Audio and note playback         | `src/playback.ts`, `src/instruments.ts`         | Raw audio or synthesized notes, with instrument/octave settings |
| Web MIDI output                 | `src/midiout.ts`, `src/midi-playback.ts`        | Device selection and scheduled external note playback           |
| Tempo estimation                | `src/tempo-model.ts`, `src/clap-detector.ts`    | Estimate BPM from taps or microphone claps                      |
| Sound source profiles           | `src/recording-profiles.ts`                     | Whistle analysis settings and calibration checks                |
| Storage codec                   | `src/codec.ts`                                  | Float32↔Int16, gzip via `CompressionStream`                     |
| IndexedDB library               | `src/db.ts`                                     | Persisted recordings (no deps)                                  |
| Per-recording tuning            | `src/tuning.ts`                                 | Defaults + last-used persistence                                |
| Path router                     | `src/main.tsx`, `src/router.ts`                 | React Router and route helpers                                  |
| Screens and hooks               | `src/components/*.tsx`, `src/hooks/*.ts`        | React rendering and browser effects                             |
| Screen models                   | `src/capture-model.ts`, `src/editor-model.ts`   | Pure calculations shared by hooks and tests                     |
| Shared UI + entry               | `src/components/primitives.tsx`, `src/main.tsx` | controls and app root                                           |

The recorder captures contiguous raw PCM via an AudioWorklet; detection re-runs
deterministically when a recording is opened, so the editor always reflects the
current code and tuning.

### Inspecting / tuning detection

Each recording can be exported from the editor's **Recording** panel:

- **Download .wav** — the raw captured audio (mono 16-bit PCM), the ground truth
  for offline analysis.
- **Download .json** — the metrics: config (band, clarity threshold, noise gate),
  quality stats, the segmented notes, and the full per-frame pitch track.
- **Copy log** — the same report as compact text, for pasting inline; processing
  stages appear as counts, with full detail left to the JSON.

Schema-2 JSON includes complete saved and effective analysis/tuning settings, BPM,
grid, muted anchors, playback settings, build identity, full-precision pitch frames,
segmented and quantized notes, collision adjustments, final enabled notes, and
absolute MIDI tick events. The top-level `notes` are the notes exported to MIDI.
Exports from `npm run dev` record the build revision and source as unknown, because
the dev server serves edited sources live; use a production build for comparable exports.
Playback octave/instrument settings are recorded separately and do not change MIDI export.

Export JSON and WAV from the same recording. JSON identifies the exact mono PCM16
WAV with its SHA-256, sample count, and sample rate. WAV export preserves the PCM
samples used for analysis. A local developer replay command checks the pair and
reports the first differing processing field:

```bash
npm run debug:recording -- --json recording.json --wav recording.wav --out /tmp/diapason-replay
```

It writes a replay summary and regenerated MIDI; mismatched audio is rejected, and
a processing mismatch exits unsuccessfully. Older JSON exports are reported as
incomplete because their missing settings cannot be recovered reliably. Browser
and output descriptions are diagnostic context, not a snapshot of an external
synth's sound or hardware configuration.

Together these let detection be debugged without being at the mic.

### Tuning panel

The editor's **MIDI** panel exposes the segmentation parameters as live sliders —
stickiness (hysteresis), min note length, silence gap, change debounce,
smoothing, clarity gate, and level gate. Stickiness and minimum note length are
shown directly; the remaining sliders are under **More**. Changes apply
**instantly** to the recording's MIDI roll, playback, and MIDI export and are
saved with the recording. Double-click a slider label to reset it, or use
**Reset all**. New recordings inherit the last-used tuning, with the level gate
set by the new room measurement during setup.

Pitch detection is deliberately **band-limited** (250–3000 Hz) to the whistle
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
- **Live capture only** — file upload is a planned addition.
- **Vibrato / pitch wobble** is smoothed with a median filter but can still
  nudge borderline notes across a semitone boundary.

## Roadmap ideas

- Amplitude-based onset detection for repeated notes
- WAV/MP3 file input
- Scale snapping (constrain output to a chosen key)
- Additional sound sources, such as humming and instruments

### Runtime test coverage

`npm run test:coverage` collects V8 coverage for all production TypeScript, including unexecuted files. Reports are in `coverage/index.html`, `coverage/coverage-summary.json`, and `coverage/coverage-final.json`. `npm run metrics:coverage` regenerates coverage and passes it to Fallow for measured function risk. Unlike static test dependency reachability, this measures executed code; mocked implementations do not count as exercised. `npm run check` collects coverage once and reports coverage-aware metrics. No percentage gate is imposed before establishing a baseline.
