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
   click anywhere on a row to open its editor, duplicate, or delete.
2. **New recording** (`/diapason/new`) — a guided setup: choose your sound →
   connect and verify your microphone → measure room noise → check your sound →
   find your tempo → record. Set tempo by tapping a button/Space, clapping into
   the microphone, or entering BPM. Preview the metronome and choose beats per
   bar, then confirm. One bar counts you in before recording starts on the downbeat.
   Below 120 BPM, a quieter click halfway after beats 3, 5, and subsequent odd
   beats helps you keep your place. The same beat indicator flashes twice;
   beat 1 retains its distinct accent. This applies to preview, count-in, and recording.
   Each take saves to the Library while the studio stays ready for another recording.
   The metronome guides your timing; its beat schedule never blanks captured pitches.
   Stored audio stays untouched.
3. **Editor** (`/diapason/recording/:id`) — all post-processing on a recording: pitch trace,
   **per-recording melody presets and controls**, an interactive
   MIDI piano roll with named note previews, audio/MIDI playback, rhythm controls, and
   exports (`.mid` / `.wav` / `.json` / log). Click a note to preview it;
   Ctrl/Cmd+click to mute or unmute it for playback and MIDI export.

The **Recording workstation** uses a Slate & blue theme that follows your system's
light/dark preference. The live canvas and six-step setup dock each use half the workspace,
without width caps, surrounding cards, or gutters. On phone portrait,
the wizard sits below the canvas with equal-width steps, short labels, and
aligned single-line summaries. Short landscape screens keep the two-column
layout and hide step labels and summaries, showing the active step's heading
instead. The input level spans the live canvas width, inset from its edges, in a floating widget matching
the editor’s zoom controls. The steps mark completed
setup with green checkmarks and labels, while amber summaries distinguish the
selected values. The current step keeps a blue fill with a contrasting outer ring,
including when revisiting a completed step. Continuing from sound selection connects the
microphone and requests browser permission if needed; the microphone step then
shows its settings, with a connection retry available if access fails.
Microphone, gain, and tempo fields use compact label/control rows. Pitch and the
audio-clock-synchronized metronome stay at the top of the canvas in both
orientations. Live octave labels use the editor’s right-aligned pitch gutter;
clipping is flagged in red within the floating level meter.
Record is available only after setup. The same button becomes a bright red **Stop**;
the wizard folds around the Record step, giving the live canvas more space.
The Record step's icon becomes the green diapason mark. Portrait uses the same
green bordered badge beside Stop. Record and Stop keep
the same size and screen position throughout collapse and expansion.
The wizard is cropped from the left as its width changes, keeping its contents
fixed during collapse and expansion.
Stopping restores the layout, saves a separate take, and briefly shows
**Recording saved**. The count-in and timer reset for the next take, with
calibration and tempo retained.

The larger confirmation toast sits at the bottom center, clear of the Record
button. Recording and microphone errors use red toasts in the same position;
they do not shift the wizard layout. Both parts of the breadcrumb use matching
type size and alignment.

A short take or save failure leaves setup ready to retry. Clap listening and
metronome preview also use one button to start and stop. Setup actions stay visible
at the bottom; dense steps scroll internally, with edge shadows indicating more
content. Reduced motion preferences disable the folding animation.

All three screens share the Slate & blue system theme, compact header, readable
type, and shared controls built with Tailwind, the shadcn/ui component pattern,
semantic theme tokens, and Lucide icons. The Editor uses a shared timeline with
original audio above an edge-to-edge MIDI roll. A divider handle hides or restores
original audio; mobile starts with it hidden. When shown, original audio occupies
22% of the workspace height; the stronger divider highlights across the canvas
when its Show/Hide handle is hovered. Tune floats over the right side,
starts at 360px, and resizes from 286px to half the workspace. Matching Play and
Download pairs move left of Tune. Preset and Key dropdowns contain their
Preview/Use actions, as do Mode, Timing grid, Instrument, and Octave. Preview
keeps the menu and Tune open for comparing alternatives; Use applies and closes
the menu. Applied and previewed options have highlighted backgrounds. Shared
Radix popovers float above the canvas, stay inside the viewport, and dismiss
with an outside click or Escape. The Key menu includes Auto, suggestions, and all 24 keys;
Essentials, Pitch, Rhythm, and Detection expose the same complete controls.
Instrument and octave sit in Tune. Rename lives in the header, with duplicate,
delete, text/JSON diagnostics, and copying logs under Recording actions. Mobile
keeps external MIDI selection in that menu.

Time zoom, pitch zoom, Fit, and shared pan float over the roll. Middle-button
drag pans both axes on either canvas; Ctrl+wheel zooms time around the pointer,
and Shift+wheel changes note height. On touchscreens, drag to pan and pinch horizontally
to zoom time or vertically to change note height, without zooming the page. Tune
stays visible before Play and Download, matches Play’s size, and toggles its panel
with an active highlight. Trace overlay stays at bottom left. The pan
slider sits above the buttons, keeping the buttons fixed when it appears. Playback
follows the playhead through the uncovered area and highlights sounding notes.
Real preset and key previews appear on the roll with a preview label; regular
Stop ends the audition and restores applied notes. Previewing never saves or
changes exports. Saved charts redraw when the theme or container changes.
The Library keeps audio/MIDI
previews and Open visible, with Duplicate and Delete in each row's actions menu.
Library action menus dismiss on outside taps and Escape.
Each Library row has a subtle blue gradient with a compact waveform cut out
behind the labels, preserving the original row height and controls. Recordings
without a waveform show the gradient alone. Wider, spaced waveform bars have a thin blue outline
outside their edges, keeping the waveform visible where the gradient fades. Rows highlight on hover and keyboard focus. The original-audio preview preserves pauses and relative loudness,
uses a compact summary saved with each new take, and survives reloads and
duplication. Older recordings gain previews gradually in the background when
you visit the Library; unavailable previews do not block playback.

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

Three interactive **editor layout studies** are available at
[`/diapason/prototypes/editor-directions.html`](http://localhost:5173/diapason/prototypes/editor-directions.html)
while the development server is running. Compare a 25/75 audio–MIDI split, a shared
timeline with a slim original track, and a MIDI canvas with tools shown on demand.
The shared-timeline study now opens by default. Its original track can be hidden
(hidden initially on mobile); matching Play/Download pairs sit at each track's
top right, instrument and octave live in the toolbox, and zoom floats over the
canvas. The divider handle restores or hides the original track without removing
the MIDI canvas. Download log is under Recording actions.
Tune starts wider and can be dragged from 286px up to half the workspace, or
switched between docked and overlay placement. Preset auditions appear on the
roll with a preview label and sounding-note highlights; the regular Stop button
ends the preview and restores the applied version. Zoomed playback follows the
playhead across both tracks.
Try the preset dropdown's Preview/Use actions, grouped tuning controls, note
selection and muting, and time/pitch zoom. These are standalone design prototypes
with a generated demo melody and synth audio; they do not load or modify saved
recordings, run the melody correction engine, or export MIDI. The shipped Editor implements the approved shared-timeline overlay direction. See [the study notes](prototypes/editor-directions.md)
for tradeoffs and review details.

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

Schema-4 JSON includes saved and effective melody settings, preset overrides,
resolved weights, automatic/explicit key and alternatives, implied harmony,
faithful and corrected notes, muted anchors, playback settings, build identity,
full-precision pitch frames, and final enabled notes with absolute MIDI tick events.
Saved pitch edits, source scopes, automatic/effective notes, and inactive coverage
are included. The top-level `notes` are the notes exported to MIDI. Schema-3 and older exports report an
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
- **Key:** One dropdown contains Auto, three suggested alternatives, and all 24
  explicit keys, each with Preview and Use actions.
- **Controls:** Essentials groups Steadiness, Pull into key, and Pull onto grid.
  Pitch includes key pull, Mode, Smooth leaps, and Max pitch move. Rhythm holds
  Timing grid, grid pull, Swing, Syncopation, and Note length. Detection holds
  Steadiness, Level gate, Minimum note length, and Silence gap. Changing a control
  shows **Custom (from …)** and saves it. Click a label to reset that
  control; labels are non-selectable and highlight on hover. Preset, Key,
  Instrument, and Octave labels also reset their respective defaults.
  **Reset**, pinned at the bottom of Tune, asks for confirmation before restoring
  the current preset's controls and retaining the key.
  Each control uses one label–widget–value row; explanations appear in tooltips.

Click a piano-roll note to hear it and open a floating menu beside it with its
number, name, start time, duration, **Copy ID**, Mute, context Play/Stop,
**Up one semitone**, **Down one semitone**, and **Reset pitch**.
The selected note keeps keyboard focus on the roll and has a visible outline.
The menu places actions above note information on mobile. Note and context
previews preserve synth release tails; interrupted synth playback fades out.
Copy ID briefly shows a checkmark without changing the button width. Pitch labels
align on the right edge of the canvas gutter, with a soft background fade shared
by the live recording view. Editor track labels have an 80% opaque background. The original-track divider and its
Show/Hide button share a double border on hover.
Click empty canvas or outside the menu, or press Escape, to dismiss it.
Note IDs (for example, **Note #13**) follow the current detected sequence and
also appear in JSON items and text diagnostics; muting does not renumber them.
Detection changes that split or merge notes can renumber the sequence. Focus the roll and use arrow keys or Home/End to select
and audition notes, Enter/Space to replay, and M to mute/unmute. Ctrl/Cmd+click
also toggles mute. Muted anchors survive preset changes. Tune's divider supports
Left/Right, Home, and End. Tuning categories share a row when space permits
and wrap on narrower sidebars. Mobile keeps Tune open during previews too.

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

Feature ideas and planned work are tracked in
[GitHub issues](https://github.com/dkarlovi/diapason/issues).

Manual pitch editing follows the
[source-based design](docs/superpowers/specs/2026-10-26-note-editing-design.md)
and [implementation plan](docs/superpowers/plans/2026-10-26-note-editing.md).
A chosen MIDI pitch survives key, tuning, grid and preset changes. Splits inherit
it; resetting one child clears only that child's source coverage. Edited coverage
protects note boundaries from merges, even when neighboring pitches agree. A dot
on the roll marks explicit edits, including muted notes and choices that equal the
automatic pitch. Up then down remains an edit until Reset pitch.

Filtering may hide an edited note without deleting its intent. Restore the detection
settings to recover it; Recording actions shows an inactive pitch-edit count and
**Reset all note edits**, with confirmation, to clear active and hidden edits.
Tune reset preserves manual edits. Pitch controls are disabled during tuning
previews; Stop restores applied notes and selection. Playback octave shifts edited
notes once, for both browser and external MIDI playback, without changing the roll,
stored pitch, or exported MIDI. Original audio stays untouched. Timing and velocity
editing remain deferred.

## Runtime test coverage

`npm run test:coverage` collects V8 coverage for all production TypeScript, including unexecuted files. Reports are in `coverage/index.html`, `coverage/coverage-summary.json`, and `coverage/coverage-final.json`. `npm run metrics:coverage` regenerates coverage and passes it to Fallow for measured function risk. Unlike static test dependency reachability, this measures executed code; mocked implementations do not count as exercised. `npm run check` collects coverage once and reports coverage-aware metrics. No percentage gate is imposed before establishing a baseline.

In portrait recording, the live monitor grows down toward the fixed Stop row.
The setup controls fold away and Back crossfades to the logo in that row.
