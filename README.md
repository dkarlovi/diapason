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
   **per-recording melody presets and controls**, an interactive
   MIDI piano roll with named note previews, audio/MIDI playback, rhythm controls, and
   exports (`.mid` / `.wav` / `.json` / log). Click a note to preview it;
   Ctrl/Cmd+click to mute or unmute it for playback and MIDI export.

The **Recording workstation** uses a Slate & blue theme that follows your system's
light/dark preference. Its compact header keeps the live signal in view while a
horizontal six-step wizard shows your setup values
directly, without a separate wizard heading or step counter. The input-level
strip and wizard action strip share the same height. The steps mark completed
setup with green checkmarks and labels, while amber summaries distinguish the
selected values. The current step keeps a blue fill with a contrasting outer ring,
including when revisiting a completed step. Continuing from sound selection connects the
microphone and requests browser permission if needed; the microphone step then
shows its settings, with a connection retry available if access fails.
Microphone, gain, and tempo fields use compact label/control rows. The input level
sits below the signal;
pitch, clipping, and the audio-clock-synchronized metronome appear on the canvas.
Record is available only after setup. The same button becomes **Stop & save**;
the wizard folds down to step 6 and the signal expands while it runs. Stopping
restores the layout while the take saves, then opens the editor. A short take or
save failure leaves setup ready to retry. Clap listening and metronome preview
also use one button to start and stop. Narrow screens stack the signal above
setup; reduced motion preferences disable the folding animation.

All three screens share the Slate & blue system theme, compact header, readable
type, and shared controls built with Tailwind, the shadcn/ui component pattern,
semantic theme tokens, and Lucide icons. The Editor keeps original audio on the
left and MIDI on the right, with matching playback/download actions. Their
canvases stay visible while recording settings and melody controls scroll below.
On narrow screens, paired charts remain pinned above the stacked toolboxes.
Presets retain separate preview and apply actions; all advanced controls,
diagnostics, and note previews remain available. Saved charts update when the
system theme or their container size changes. The Library keeps audio/MIDI
previews and Open visible, with Duplicate and Delete in each row's actions menu.

New recordings start with **Clean** and **Auto** key selection. Clean snaps to an
eighth-note grid; the other intent presets keep performed timing. A single
timing-grid control offers quarter notes, eighth notes, sixteenth notes, and
triplets. Before snapping, a constant lag behind the click (monitoring latency or
a late start) is measured from the onsets and removed, so notes land on the beat
rather than on the next subdivision. Grid pull blends performed and snapped timing
while preserving note order. Mood presets can add swing, syncopation, and legato.
Recording also compensates for the output and input latency the browser reports.
Older recordings open with the same default preset and carry over their saved
level/clarity gates, minimum note length, silence gap, and explicit grid setting.
They may sound different after this update; their original captured audio stays unchanged.

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
beat/bar lines. Room and sound checks show a full-width progress bar that fills
over the measurement period. Calibration results stay passed after you stop sounding. Changing
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
| Melody interpretation           | `src/melody/`                                   | Viterbi note decisions, key/harmony priors, rhythm and presets  |
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
| Per-recording melody settings   | `src/melody/settings.ts`                        | Preset, overrides, key choice and legacy migration              |
| Path router                     | `src/main.tsx`, `src/router.ts`                 | React Router and route helpers                                  |
| Screens and hooks               | `src/components/*.tsx`, `src/hooks/*.ts`        | React rendering and browser effects                             |
| Screen models                   | `src/capture-model.ts`, `src/editor-model.ts`   | Pure calculations shared by hooks and tests                     |
| Shared UI + entry               | `src/components/primitives.tsx`, `src/main.tsx` | controls and app root                                           |

The recorder captures contiguous raw PCM via an AudioWorklet; detection re-runs
deterministically when a recording is opened, so the editor always reflects the
current code and melody settings.

### Inspecting / tuning detection

Each recording can be exported from the editor's **Recording** panel:

- **Download .wav** — the raw captured audio (mono 16-bit PCM), the ground truth
  for offline analysis.
- **Download .json** — the metrics: config (band, clarity threshold, noise gate),
  quality stats, interpreted notes, key/harmony, and the full per-frame pitch track.
- **Copy log** — the same report as compact text, for pasting inline; processing
  stages appear as counts, with full detail left to the JSON.

Schema-3 JSON includes saved and effective melody settings, preset overrides,
resolved weights, automatic/explicit key and alternatives, implied harmony,
faithful and corrected notes, muted anchors, playback settings, build identity,
full-precision pitch frames, and final enabled notes with absolute MIDI tick events.
The top-level `notes` are the notes exported to MIDI. Schema-2 exports report an
older pipeline and cannot replay exactly through the new engine.
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

### Melody correction

The editor's **MIDI** panel uses one engine for the piano roll, library/editor
playback, previews, diagnostics, and MIDI export. **Play** auditions a preset or
suggested key without saving it; **Use** applies it. Press Play again to stop a
preview. Starting another preview replaces it.

- **Intent:** As played, Gentle fix, Clean, and Keep my odd notes.
- **Mood:** Happy, Sad, Dreamy, and Syncopated.
- **Key:** Auto, three suggested alternatives with previews, and all 24 keys under
  **I know my key**.
- **Controls:** Steadiness (keep held notes whole, absorb short slips), Pull into key
  (from exactly what you whistled to always in key, guided by the key and implied
  chords), Mode (as detected, major or minor), and Timing grid are directly
  visible. **More** holds Level gate, Minimum note length, Silence gap, Smooth
  leaps, Max pitch move (fixes notes you could not hit: a note that clashes with
  the implied chord moves onto the nearest chord tone within that many
  semitones; off-beat passing and neighbour notes, reached and left by step, are
  kept as the melody's decoration; 0 by default),
  Pull onto grid (from as recorded to exactly on the grid),
  Swing, Syncopation (an anticipation of at most an eighth), and Note length.
  Changing a control shows **Custom (from …)** and saves it with the recording;
  saved values for controls that have since been retired are ignored.
  Double-click a label to reset that control; **Reset all** restores the current
  preset's controls while retaining the chosen key.

Click a piano-roll note to hear it and show its name, start time, and duration.
**Hear in context** includes neighboring notes. The **Notes** list provides the
same named previews as keyboard-accessible buttons. Ctrl/Cmd+click mutes a note;
muted anchors are kept through preset changes so switching back restores them.

The decoder finds notes before naming them. A dip in level (re-articulation) or a
real silence always starts a new note; within one articulation, a sustained pitch
step does too, while scoops, vibrato and drift stay part of the held note; higher
**Steadiness** absorbs longer slips (up to 250 ms). Each note then gets one steady-state pitch. The performer's
tuning offset from A440 is estimated from the whole take (whistlers are often a
quarter-tone off), and the tuned pitch, key, implied harmony and step size decide
each note name. Captured and exported WAV audio is never pitch-corrected. Musical
context is a prior, not knowledge of the intended tune: a note whose pitch sits
halfway between two in-key notes can still be named wrongly.

The intro sample in `src/fixtures/whistle-intro/` is an exact regression: Clean
must export its approved `clean.mid` byte for byte.

## Known limitations

- Slurred repeated notes with neither a level dip nor a pitch change merge.
- Tuning is one offset per take. A performer whose intervals wander by close to
  half a semitone note-to-note (rather than drifting slowly) can still get
  individual notes named a semitone off; repeated figures are not yet compared.
- Strong correction can flatten intended rises; weak correction can keep slips
  and pitch wobble. Presets and individual controls let you compare this tradeoff.
- Automatic key/harmony can be uncertain, especially on short intros. Try the
  previewable alternative keys or preserve odd notes when needed.
- Max pitch move recognises only off-beat passing and neighbour notes as
  deliberate. Accented decoration, such as an appoggiatura that leans on the beat
  and resolves by step, is treated as a clash and moved onto the chord.
- Max pitch move corrects towards chords inferred from the take itself, one per
  bar. A take with many wrong notes can imply the wrong chord, and the fix then
  follows it.
- Pitch detection remains monophonic and band-limited to 250–3000 Hz for whistles.
- Existing recordings can sound different with the new engine. Legacy hysteresis,
  debounce, and median-window settings no longer control note decisions.
- Capturing and correcting notes is local to the browser; audio file import and
  user-defined saved presets are not yet available.

## Roadmap ideas

- Interval consistency across repeated figures, and slowly varying tuning
- WAV/MP3 file input
- Further decoder tuning using named-note feedback in the editor
- User-defined presets
- Additional sound sources, such as humming and instruments

### Runtime test coverage

`npm run test:coverage` collects V8 coverage for all production TypeScript, including unexecuted files. Reports are in `coverage/index.html`, `coverage/coverage-summary.json`, and `coverage/coverage-final.json`. `npm run metrics:coverage` regenerates coverage and passes it to Fallow for measured function risk. Unlike static test dependency reachability, this measures executed code; mocked implementations do not count as exercised. `npm run check` collects coverage once and reports coverage-aware metrics. No percentage gate is imposed before establishing a baseline.
