# diapason

Whistle into your microphone and get a MIDI file out. Browser-based, fully
client-side monophonic **pitch → MIDI** — built for people who can't play an
instrument but can carry a tune by whistling.

> A _diapason_ is the full tonal compass of a voice or instrument, and the
> historical name for a tuning-fork pitch reference. Fitting for a tool that
> turns your whistle into notes.

Product audience, purpose, scope, and constraints are recorded in
[`PRODUCT.md`](PRODUCT.md). The implemented visual system and shared component
guidance live in [`DESIGN.md`](DESIGN.md), with an Impeccable component preview
catalog in `.impeccable/design.json`. Recording, original audio, and MIDI share
`PitchCanvas`, theme tokens, and the existing trace renderer; each screen retains
its own recording or editing controls. For design exploration, build quick,
runnable visual mockups in code before production implementation, as with the
existing editor layout studies. Impeccable workflow defaults live in
`.impeccable/config.json`.

## A recording studio

diapason is organized as a **library of recordings**, persisted in your browser
(IndexedDB) so a refresh never loses them. Three views, routed by URL path:

1. **Library** (`/diapason/`) — your recordings. Preview audio or MIDI,
   click anywhere on a row to open its editor, duplicate, or delete. **Import WAV**
   (or drag files anywhere below the header while the Library is open; a drop area shows
   while they hover and refuses files the browser reports as something other than WAV) opens
   a popover listing each file's name, recording time, tempo, meter and diapason
   version before anything is saved. The Import icon becomes a spinner while files
   are read or saved.
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

Pitch analysis starts when you open a take or request its MIDI preview. It runs
in a Web Worker and is cached separately in IndexedDB, so reopening a take or
returning to the Library reuses its exact frames. The detector reuses window-energy
sums and skips unused pitch lags to reduce CPU work while preserving the analysis
results for stored audio. Changes to acoustic analysis
settings or the detector implementation invalidate the cache. While analysis is
running, the editor shows its progress, and a slim indicator sits along the Library
row’s top border without moving its contents; audio playback and WAV
download remain available. MIDI playback, export, and editing enable automatically
when analysis completes. Library Open waits for an active analysis to finish;
direct editor URLs join the same job, including across navigation. Failures show
an explicit Retry analysis action. A full cache storage quota shows a warning while
keeping the analyzed take usable. Environments without Workers use synchronous
analysis, which can pause the page on a long take.

Library actions use **Import** and **New** at every screen size, keeping the mobile
heading on one line. Opening New or a recording from an app link requests fullscreen on
supported mobile browsers. The header's fullscreen toggle also works after a direct
URL visit or after leaving fullscreen; unsupported or denied requests leave the
normal studio usable. Browser fullscreen requires a user gesture.

Shared notifications appear in the center of all three screens with a translucent
surface, status icon, and Dismiss button. Saved takes and single-recording imports
include **Open**. Playback, deletion, duplication, and export errors use the same
feedback. Notifications dismiss after 6 seconds (8 with an action, 10 for errors)
and pause while hovered or focused. Editor save failures retain their persistent
Retry/Reload controls. Tune's Reset sits beside its heading so the scrollable
controls have more room on small screens. On short phone landscape screens, Tune
can extend over the zoom toolbar to make more room.

The **Recording workstation** uses a seed-generated theme (blue & slate by default) that follows your system's
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
metronome preview also use one button to start and stop. Running playback and
tempo actions use amber, while recording Stop remains red. Setup actions stay visible
at the bottom; dense steps scroll internally, with edge shadows indicating more
content. Reduced motion preferences disable the folding animation.

All three screens share one seed-generated theme, compact header, readable
type, and shared controls built with Tailwind, the shadcn/ui component pattern,
semantic theme tokens, and Lucide icons. The Editor uses a shared timeline with
original audio above an edge-to-edge MIDI roll. A divider handle hides or restores
original audio; mobile starts with it hidden. Tune slides/fades and original audio
folds with brief transitions using the recording screen's easing after user
toggles only. The editor initially presents its layout without animation; reduced-motion
preferences make both immediate. Active tuning categories retain readable colors
on hover. When shown, original audio occupies
22% of the workspace height; the stronger divider highlights across the canvas
when its Show/Hide handle is hovered. Tune floats over the right side,
starts at 360px, and resizes from 286px to half the workspace. Matching Play and
Download pairs move left of Tune. Download is the primary action; both audio and MIDI downloads become icon-only
when the uncovered canvas is narrow. Play is a secondary preview action with an
icon-only button in compact layouts. Preset and Key dropdowns contain their Preview/Use actions, as do
Mode, Timing grid, Instrument, and Octave. Desktop previews keep the menu and
Tune open for comparison; on mobile an audition closes both and focuses the roll.
Reopening Tune restores the last menu. Use applies and closes the menu. Applied
options are blue; running auditions and their Stop buttons are amber. Options
include explicit Applied/Previewing labels, and the roll names the audition and
whether it is applied. A preset with custom overrides is a base preset rather
than an applied recipe. Shared
Radix popovers float above the canvas, stay inside the viewport, and dismiss
with an outside click or Escape. The Key menu includes Auto, suggestions, and all 24 keys;
Essentials, Pitch, Rhythm, and Detection expose the same complete controls.
Tune uses a tonal toolbox with a strong blue category selection and quieter reset
controls. **Playback sound** groups Instrument and Octave. **Melody correction**
places Preset and Key directly above the correction tabs and sliders, keeping the
recipe beside the values it controls. Rename lives in the header, with Versions, duplicate,
and delete under Recording actions. Mobile
keeps external MIDI selection in that menu.

Time zoom, pitch zoom, Fit, and shared pan float over the roll. Middle-button
drag pans both axes on either canvas; Ctrl+wheel zooms time around the pointer,
and Shift+wheel changes note height. On touchscreens, drag to pan and pinch horizontally
to zoom time or vertically to change note height, without zooming the page. Tune
stays visible before Play and Download, matches Play’s desktop size, and toggles its panel
with an active highlight. Undo and Redo sit immediately left of Tune on the MIDI
canvas. Trace overlay stays at bottom left, beside the zoom controls whenever they
fit; the controls wrap only when space runs out. The pan
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

New recordings start with **Clean** and **Auto** key selection. Clean and the
opt-in **Auto tune** preset snap to an eighth-note grid; the other intent presets
keep performed timing. A single
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
external synth/DAW via Web MIDI when supported and permitted. Both outputs support
instrument selection and an octave shift. Diapason MIDI downloads preserve both
choices in editable metadata and render them using General MIDI equivalents.
External instruments use General MIDI equivalents: square lead (Plain beep),
electric piano, steel-string guitar (Acoustic guitar), flute, trumpet, alto sax
(Saxophone), and warm pad. The synth's
soundfont determines their sound. Browser instruments are lightweight synthesized
previews: Acoustic guitar uses a plucked-string model, and Trumpet and Saxophone
use sustained harmonic tones with gentle vibrato, without downloaded samples.
Future MIDI notes stay in the app until due;
Stop cancels them and immediately silences the playback channel when interrupted.
Normal playback completion preserves the external synth's natural release tails. External timing
can be affected by browser timer throttling in background tabs.

Audio is stored as **gzipped Int16 PCM** (lossless, browser-native
`CompressionStream`, no dependencies). Downloads are lossless WAV.

### Sharing the edited tune without audio

In the Library recording actions or the editor's main recording dropdown,
**Copy tune link** packs the current melody into an ordinary URL. The editor
finishes the current gesture before copying; temporary tunes stay unsaved. **Download MIDI** in the Library or editor produces a playable
Diapason MIDI file containing the same editable tune. Both carry your current
preset/key, control choices, pitch corrections, mutes, instrument and octave.
Corrections remain marked as edits; resetting one returns to the automatic pitch
under the current musical settings. Muted notes can be unmuted.

Opening a tune link immediately opens a playable, editable tune without importing
anything into the Library. Edits, undo/redo history, names and versions live in
sessionStorage for that tab and survive refresh. The URL remains the original baseline.
**Save** in the actions dropdown creates a recording with your work and history,
then redirects to its editor. You are now editing that recording. Leaving an edited
temporary tune in the full app warns about unsaved changes; confirming discard
removes the draft. Refresh and closing the page use the browser's native warning.
Opening the link without a matching session draft starts from the original tune.
If storage is blocked, editing works in memory and a warning explains that refresh
may lose the work. Browser-duplicated tabs may initially copy a session draft.

Picking or dropping a Diapason MIDI file still offers **Import** or **Cancel** in
the Library. Inspection saves nothing; **Import** creates a new local copy, which
you can play or **Open**.
No original audio, acoustic analysis, undo history or saved versions are sent.
Your friend starts a fresh editing session and can share their changes again.
The Library distinguishes these tunes with a musical-file icon and a subtle
background tint, keeping the same row layout as audio recordings.

Imported tunes have fixed detected note boundaries. Key/mode, musical pitch
shaping, rhythm/grid/swing, note length, pitch edits, muting, instrument and octave
remain adjustable. Steadiness, minimum detected note length, silence gap and level
gate remain visible but disabled, with hover tooltips explaining that their
analysis data is not included. The explanations do not add rows to the controls. Presets apply only supported musical settings. Original-audio playback,
WAV download, acoustic diagnostics and trace overlay are unavailable for these
tunes. The editor opens with the original track closed; **Show original** stays
disabled with a tooltip explaining that the audio was not included.

Links contain a compact binary payload in the URL fragment; sharing needs no
upload or account. Timing normally uses milliseconds, with precision retained
where needed to preserve musical decisions. The current link limit is 16,384
characters; use Diapason MIDI for larger tunes or if a messaging app truncates a
link. Clipboard failure exposes a selectable link. Only intact MIDI files exported
by Diapason can be imported; ordinary MIDI import is unsupported. Other programs
can play the rendered MIDI, though their instrument sounds vary, and may remove
or invalidate Diapason metadata if they edit/re-save the file. The recipient's
MIDI device routing and viewport are local choices.

See [the portable format](docs/portable-tune-format.md) for packing, compatibility
rules, decoder limits and reproducible size measurements.

### Sharing recordings as WAV

The editor's **Download WAV** is a portable recording package: the original mono
PCM16 audio plus versioned JSON in the `dpsn` chunk containing capture settings,
full current edit intent (including hidden edits), current melody, playback
settings, exact exported MIDI bytes, and original pitch/processing evidence. Standard `LIST/INFO` and `acid`
chunks retain title, date, tempo, and meter for audio tools that support them.
MIDI remains the musical deliverable; the WAV keeps everything needed to revisit
its source and investigate detection.

Import the WAV in the Library and choose **Restore saved tune and edits** (default)
or **Start fresh from audio**. No separate tune or MIDI import is needed. Fresh
imports use capture defaults while keeping the received package as a reference.
For an existing recording, open the local copy or explicitly **Import as copy**;
imports never overwrite local work. With matching processing code, restoring the
tune reproduces the edited melody and MIDI. If current analysis differs, the
editor shows a notice and retains the original evidence for CLI inspection.

Capture provenance survives subsequent exports; current tune, evidence, and export
provenance are refreshed. PCM samples remain unchanged, but the complete file may
change after editing or re-exporting. Schema-1 WAVs still import as fresh takes.
History, named versions, theme, viewport, selection, temporary auditions, and MIDI
device routing are not exported. Apply or stop an unapplied audition before
exporting. Audio tools may strip Diapason chunks when re-saving the file.

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

The dev server also offers **Singing / humming (experimental)**. It uses provisional
65–1500 Hz detection with a 4096-sample window. In the existing **Check your sound**
step, hold your lowest comfortable note for two seconds, then your highest. Each
measurement starts when you press its button and can be retried separately. Use a
comfortable voice without straining; a gliding or unclear note needs another try.
The footer guides you through low and high measurements. Results use the same
compact rows as microphone settings, with secondary Retry controls. Revisiting a
passed sound check offers **Continue**, preserving the measured range. Before
calibration passes, **Use default range** is a secondary option inside the panel;
it performs the normal sound check without personal range calibration.

After both notes pass, a shaded band on the live canvas shows your range plus
three semitones of margin at either end, within the source profile's bounds.
The low/high limits stay visible during silence. The detector uses this range
only to resolve ambiguous pitches; clear notes outside it can still be recorded.
Changing the source, microphone, gain or room calibration clears the range;
changing tempo keeps it. Retrying either endpoint removes the band until both
measurements pass again. Each take saves its effective preference for editor and
library analysis, diagnostics, WAV sharing and replay.

One adult male humming sample and one singing sample have been checked, including
exact diagnostics replay. Higher-register recordings still need validation, so
this source remains experimental and is offered only in development builds.
Existing saved voice takes remain readable in production. Export WAV and JSON
from the editor to contribute another validation sample.

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
| Processing evidence             | `src/diagnostics.ts`                            | Structured processing evidence for WAV packages and CLI replay  |
| MIDI file writer                | `src/midi.ts`                                   | Standard MIDI File (Type 0), no deps                            |
| Metronome                       | `src/metronome.ts`                              | Count-in + audible click, AudioContext-scheduled                |
| Tempo quantization              | `src/quantize.ts`                               | Snap note start/length to a beat grid                           |
| Audio and note playback         | `src/playback.ts`, `src/instruments.ts`         | Raw audio, or synth notes scheduled 2s ahead of the audio clock |
| Web MIDI output                 | `src/midiout.ts`, `src/midi-playback.ts`        | Device selection and scheduled external note playback           |
| Tempo estimation                | `src/tempo-model.ts`, `src/clap-detector.ts`    | Estimate BPM from taps or microphone claps                      |
| Sound source profiles           | `src/recording-profiles.ts`                     | Whistle analysis settings and calibration checks                |
| Storage codec                   | `src/codec.ts`                                  | Float32↔Int16, gzip via `CompressionStream`                     |
| IndexedDB library               | `src/db.ts`                                     | Persisted recordings (no deps)                                  |
| Per-recording melody settings   | `src/melody/settings.ts`                        | Preset, overrides, key choice and legacy migration              |
| Path router                     | `src/main.tsx`, `src/router.ts`                 | React Router and route helpers                                  |
| Screens and hooks               | `src/components/*.tsx`, `src/hooks/*.ts`        | React rendering and browser effects                             |
| Screen models                   | `src/capture-model.ts`, `src/editor-model.ts`   | Pure calculations shared by hooks and tests                     |
| Editor playhead                 | `src/playhead-store.ts`                         | Zustand store; playback ticks redraw canvases outside React     |
| Shared UI + entry               | `src/components/primitives.tsx`, `src/main.tsx` | controls and app root                                           |

The recorder captures contiguous raw PCM via an AudioWorklet; detection re-runs
deterministically when a recording is opened, so the editor always reflects the
current code and melody settings.

### Inspecting / tuning detection

Download one WAV from the editor and give that file to the developer or agent.
Browser log/JSON downloads and clipboard diagnostics have been replaced by a
repository CLI (Node 22+ and `npm ci` required):

```bash
bin/diapason inspect recording.wav
bin/diapason inspect recording.wav --json
bin/diapason compare recording.wav --out /tmp/diapason-comparison
```

`inspect` reads the saved settings, named notes, edits, mutes, quality, build
identity, and pitch evidence; `--json` exposes the complete saved metadata.
`compare` uses the current analysis code to reproduce the edited result and to
analyze without manual pitch edits, their protected boundaries, or mutes. It
compares source time ranges so note splits and merges remain visible. Explicit
corrections express intent; untouched notes are not automatically approved, and a
mute is not proof that the source was unvoiced.

The output directory receives `comparison.txt`, `comparison.json`, `saved.mid`,
`edited.mid`, and `automatic.mid`. Existing output files are refused; use a new
directory for each experiment. MIDI uses the selected playback instrument/octave;
comparison pitches remain logical. Exit codes are 0 for valid inspection or an
matching edited replay, 1 for a replay difference, and 2 for invalid input/usage or an
unavailable baseline. Automatic-versus-edited differences alone do not fail. Numeric evidence allows
`1e-9` absolute floating-point tolerance between browser and Node; MIDI bytes
must match exactly.
Schema-1 packages can be inspected, but have no saved melody to compare.

The WAV's PCM data chunk is hashed with SHA-256 and checked before comparison.
Saved observations remain separate from recomputation. The tool leaves the input
WAV unchanged and is intended for repeated use throughout decoder tuning. Future
focused queries can examine individual passages, notes, and frames through this
same interface; those zoom/query commands are not implemented yet. Full-resolution
evidence and source-time coordinates remain available in JSON meanwhile.

Development exports report unknown source identity; production exports include
build/pipeline identity. Browser/output descriptions are context, not a snapshot
of an external synth's sound. Legacy JSON/WAV replay remains internal support for
older regression fixtures, rather than the current sharing workflow.

### Melody correction

The editor's **MIDI** panel uses one engine for the piano roll, library/editor
playback, previews, diagnostics, and MIDI export. **Play** auditions a preset or
suggested key without saving it; **Use** applies it. Press Play again to stop a
preview. Starting another preview replaces it.

- **Intent:** As played, Gentle fix, Clean, Auto tune, and Keep my odd notes.

- **Mood:** Happy, Sad, Dreamy, and Syncopated.
- **Key:** One dropdown contains Auto, three suggested alternatives, and all 24
  explicit keys, each with Preview and Use actions.
- **Controls:** Essentials groups Steadiness, Pull into key, Context correction,
  and Pull onto grid. Pitch includes key pull, Context correction, Mode, Smooth leaps, and Max pitch move. Rhythm holds
  Timing grid, grid pull, Swing, Syncopation, and Note length. Detection holds
  Steadiness, Level gate, Minimum note length, and Silence gap. Changing a control
  shows **Custom (from …)** and saves it. Each control has an explicit Reset
  button with a tooltip and accessible name; labels remain ordinary field labels.
  Preset, Key, Instrument, and Octave also have scoped Reset buttons.
  **Reset** asks for confirmation before restoring the current preset's controls
  and retaining the key. Reset actions can be undone, including resetting all note edits.
  Compact control rows retain their values and resets; explanations appear in tooltips.

Presets only supply control values; they never select hidden processing behavior.
The **Context correction** slider is available on every preset: 0% preserves
the original scoring, and 100% applies the reviewed contextual correction.
**Auto tune** sets that slider to 100%; the other presets start at 0%.
Context correction favors the natural
scale while allowing a minor key's raised seventh over the inferred major
dominant chord, and discourages large melodic jumps. **Pull into key** adjusts
the scale preference; **Smooth leaps** adjusts the melodic preference. It uses
the same note detection as Clean and does not add glide handling or alter the
recorded audio. Preview it before applying: it can change deliberate chromatic
notes, and it does not guarantee a correct transcription. As played and Keep my
odd notes remain available for performances where those exceptions matter.
Existing presets retain their interpretation at their default control values.
Sharing and MIDI use interpretation version 2 when Context correction is active
or explicitly overridden, regardless of the base preset. Version 1 tunes remain
readable with Context correction at 0%.

### Undo, redo, and saved versions

Global **Undo** and **Redo** sit left of Tune on the MIDI canvas and remain
available with Tune closed. They walk completed
musical edits in order: pitch changes, muting, tuning, playback settings, resets,
and version restores. Dragging a slider or note updates the result live and saves
one edit when released. Escape cancels a drag; a held slider adjustment key commits
on release. Returning a gesture to its starting value adds no edit. Each pitch
stepper activation is a separate edit. Recording names, selection, zoom, and
unapplied previews are outside this history.

Use **Ctrl/Cmd+Z** to undo, **Ctrl/Cmd+Shift+Z** to redo, or **Ctrl+Y** to redo.
Text fields retain their own native undo. A changed edit after Undo replaces the
forward redo path. Reset means back to the control's default; Undo restores the
custom values that preceded it.

**Versions** in the top-right Recording actions menu lets you save the applied state under a name, preview or restore it,
rename it, or delete it. Names must be nonempty and unique within the recording
(case-insensitively). Restoring a version is an undoable edit. Saved versions
remain available even when you edit after undoing past them.

For ordinary recordings, the latest committed state autosaves locally in IndexedDB. Leaving the recording
editor, switching recordings, or reloading ends the undo session: earlier unnamed
states and redo are discarded. Reopening loads the latest saved working state,
with your saved versions available separately. Merely hiding Tune or switching
browser tabs does not end the session. Only manually saved versions preserve
older states across sessions; automatic commits do not accumulate permanent
history. Tunes saved from a temporary URL editor preserve their transferred history,
including subsequent edits and the redo cursor, across reopening. Versions share
the original audio when present and store musical editing intent.

A save failure keeps the pending state in memory and shows **Retry save**, including
after navigation. An editor saves only over the state it expects: if another tab
has saved first, the stale save fails and shows **Reload**. Reload discards that
tab's unsaved edits, so resolve a conflict before continuing work. Closing the page
can lose unsaved changes or an unfinished gesture; only completed database writes
are durable. Duplicates start with the current intent and no saved versions or undo history.
Deleting a recording also deletes its versions.

Versions stay in this browser. WAV export/import continues to carry the captured
take without editor state or versions. Versions preserve settings rather than a
frozen processing engine, so later app updates can change how an old version sounds.

Click a piano-roll note to hear it and open a note inspector beside it. Its darker
heading shows the note number and name, start time and duration, with context
Play/Stop and **Mute note** (a pressed toggle while muted). Below it, the **Pitch** row
has **Down one semitone** and **Up one semitone** steppers and a **Reset pitch**
button that appears once the pitch is edited; the row and buttons keep their
positions as the note is muted or edited. Once a note is selected, drag it up or
down to change its pitch: it snaps to semitones, plays each new pitch, and shows the
result live on the roll and in the inspector; the edit is saved on release, and
Escape or a second finger cancels it. Only the selected note can be dragged, and only
vertically; pressing elsewhere still selects, and touch drags elsewhere still pan.
The selected note keeps keyboard focus on
the roll and has a visible outline. On phones the inspector docks at the bottom of
the roll, scrolls the selected note into the area above it, and replaces Tune while
it is open. Note and context previews preserve synth release tails; interrupted
synth playback fades out. Pitch labels
align on the right edge of the canvas gutter, with a soft background fade shared
by the live recording view. Editor track labels have an 80% opaque background. The original-track divider and its
Show/Hide button share a double border on hover.
Click empty canvas or outside the menu, or press Escape, to dismiss it.
Note IDs (for example, **Note #13**) follow the current detected sequence and
also appear in the CLI JSON and text reports; muting does not renumber them.
Detection changes that split or merge notes can renumber the sequence. Focus the roll and use arrow keys or Home/End to select
and audition notes, Up/Down to change the selected note's pitch by a semitone
(Shift for an octave), Enter/Space to replay, and M to mute/unmute. Ctrl/Cmd+click
also toggles mute. Muted anchors survive preset changes. Tune's divider supports
Left/Right, Home, and End. Tuning categories share a row when space permits
and wrap on narrower sidebars. Mobile auditions reveal and focus the roll; reopening
Tune returns to the last menu.

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

## Embedding

Embed the recording studio in a lesson or songwriting page:

```html
<iframe
  src="https://dkarlovi.github.io/diapason/new?embed=1&amp;afterRecording=edit"
  title="Whistle-to-MIDI studio"
  allow="microphone"
  width="720"
  height="420"
></iframe>
```

- `embed=1` removes the header and Library navigation. Recording embeds redirect Library
  and unknown routes to New recording; tune embeds stay on their specific tune. The logo sits beside the canvas labels
  in capture and editing. This is a workflow restriction, not storage isolation.
- `afterRecording=edit` opens the Editor only after a recording saves successfully.
  Without it, the studio stays ready for another take. This option also works without embedded mode.
- Both settings survive internal navigation, deletion, and starting
  another recording. Omit both to retain the standalone experience.

To embed a specific tune, use its shared URL with `embed=1` before the fragment:

```html
<iframe
  src="https://dkarlovi.github.io/diapason/tune?embed=1#tune=RFBTTgEBABJGbHkgbWUgdG8gdGhlIG1vb27AhAEAAAAAAMBbQAQCABs5rzGxRptNQCDLRqfjjllACAACIAEA4AN5L3lXoclWQAGLBMAC4LT7L3X1VkABwALqATQonEConlZAAeoBqwLdXOG4WxxWQAWWA7UDGve7bqS7VUBWAdUDqwPz50GBZyNVQAWABMADdaztr3vAVUBWAesD4ANMaMpvkiFWQAWVBKAEJfRq0nMZV0BbAaAEgAFis2uz1YZWQAWAAdUGajAqKq_AVkBaAfUHwAFn0YytHiFWQAXgAaACCIAqXRO6VUBWAesCdeibVJdKYVVAAXXrASWyqCgoIlVAAeAClgVASAJabr9UQAHgEusDJxv_AqwBVkABiwTAAugJaxAaCFZAAcAC9QHye8038ZFVQAH1AZYBSkA3qU4vVUABlgGqAe89jrQqIVVAAdUBlQN5hjcrLNZUQAHrA7UDBr22rQVAVEAB4AOqA6hrfoWFBVVAAaAEwAPqXjJQEUpVQAGVBNUFYvEfDmcjVkAB4AarA6D7lgitx1VAAZUEqwLsHlA-mr5VQAHLAusB6Px-C0ApVUAB6wGqAlSh_AxT1FRAAYAD6gLjTIrM3GpUQAHABVVuYkHihuRTQA"
  title="Fly me to the moon tune editor"
  width="720"
  height="420"
></iframe>
```

Tune embeds start directly in the editor and need no microphone delegation.
Show original and Trace overlay controls are hidden for embedded tunes without audio.
The visitor can play, edit, export, or **Save** from the actions dropdown. Capture and
Library navigation are unavailable, including after Save opens the recording
editor. The saved URL preserves `embed=1&tuneEmbed=1`; hosts do not need to add
`tuneEmbed` to the original tune link. Delete and Duplicate are unavailable in
this workflow. Existing root `/#tune=...` links also open directly in the editor.

Use a landscape-shaped frame; 720 × 420 is a useful starting point. Setup and
Tune scroll within the frame. Audio/MIDI playback, editing and MIDI downloads use
existing controls. For recording embeds, the menu beside MIDI Download contains MIDI output selection,
Reset edits, and Delete recording. Deleting returns to New recording inside the
iframe. WAV import and standalone recording management menus are unavailable in embedded
mode.

The host and studio must use HTTPS (localhost is allowed for development).
Recording embeds must delegate microphone access with `allow="microphone"`. If it sends a
`Permissions-Policy` header, that policy must allow the studio origin too; the
iframe attribute cannot override a restrictive header. Visitors must still grant
browser microphone permission. Playback starts from a visitor action. Downloads
also require a visitor action and may be restricted by browser or host policy.
Prefer an unsandboxed iframe. If the host uses `sandbox`, the workflow needs
`allow-scripts allow-same-origin allow-downloads`; browser confirmation dialogs
also need `allow-modals`.

Recordings stay in the embedded origin's IndexedDB. Browser privacy settings may
partition or block third-party storage; embed mode does not transfer recordings
or MIDI to the parent page. Download files to keep a portable copy.

For local testing, run `npm run dev` and open
[the dev-only embed playground](http://localhost:5173/diapason/dev/embed).
It opens with the “Fly me to the moon” editor embed and offers a recording/editor
mode selector, resizable iframe, width/height fields, automatic Editor and
microphone delegation toggles, and a cross-origin test using localhost and
127.0.0.1, plus theme presets and seed controls described below. Reload the frame after changing permissions. The playground is served
only by Vite's dev server and is absent from production builds. Test on a separate
HTTPS host before deployment to confirm its permission and download policies.

## Themes and embed colors

The studio generates coordinated light/dark colors from seeds using Material Color
Utilities. Its default is blue & slate with amber playback. Color names elsewhere
in this guide describe that default; custom themes retain the same semantic roles.
No preferences dialog is available yet. Ordinary button and dropdown borders use the
subdued shared border tone, while keyboard focus and active states retain their
stronger accents. Library action menus use borderless rows, and audio/MIDI source
icons share the same neutral background.

Both standalone and embed URLs accept:

- `scheme=auto|light|dark`: follow the browser preference (default), or force a
  mode to match the host page. Explicit mode selection also avoids differences in
  how browsers inherit the parent page's appearance into an iframe.
- `theme=<packed colors>`: a versioned, unpadded base64url value, 7–27 characters.
  It stores one to three RGB seeds per light/dark definition, at most six colors.
  A single definition produces both modes. Use the playground to generate the
  packed value; for example, `theme=AQEAcrE` supplies the blue `#0072b1` primary
  seed for both modes.

Primary influences actions, focus, and MIDI notes. Neutral influences quiet
surfaces and text. Secondary influences playback and the original audio trace.
The engine adjusts seed saturation and lightness for coordinated, readable output;
colors are not exact component overrides. Error, warning, and success keep their
semantic families.

Packed colors use only URL-safe characters, without JSON, `#`, or padding:

```js
const url = new URL("https://dkarlovi.github.io/diapason/new");
url.searchParams.set("embed", "1");
url.searchParams.set("scheme", "dark");
url.searchParams.set("theme", "AQEAcrE"); // Blue primary; derive both modes.
// Set your iframe's src to url.href. Recording embeds also need allow="microphone".
```

### Packing a theme yourself

The format is a small binary record, not base64-encoded JSON:

| Byte       | Contents                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `0`        | Version: `0x01`                                                                                |
| `1`        | Presence mask: OR together the flags below for supplied colors                                 |
| `2` onward | One red byte, one green byte, and one blue byte for each present color, in ascending bit order |

| Bit | Flag   | Color slot      |
| --- | ------ | --------------- |
| 0   | `0x01` | Light primary   |
| 1   | `0x02` | Light neutral   |
| 2   | `0x04` | Light secondary |
| 3   | `0x08` | Dark primary    |
| 4   | `0x10` | Dark neutral    |
| 5   | `0x20` | Dark secondary  |

Bits 6 and 7 are reserved and must be zero. At least one mode must supply a
primary. Neutral or secondary requires the primary for that same mode. Omitted
slots contribute no bytes; do not insert zero-filled placeholders. Black
`#000000` is a present color with three zero bytes. If a mode is omitted entirely,
its colors are generated from the other mode's seeds.

Encode the entire byte record as standard base64, replace `+` with `-` and `/`
with `_`, then remove trailing `=` padding. There is no compression or alpha
channel. With `n` supplied colors, the record has `2 + 3n` bytes, giving 7–27
base64url characters for one to six colors. The appearance mode is still the
separate `scheme` query parameter.

For example, light primary `#0072b1` sets mask `0x01` and produces these bytes:

```text
01 01 00 72 b1  →  AQEAcrE
```

This standalone JavaScript encoder works in browsers and Node.js 22+, without
imports or dependencies. It accepts `#RGB` or `#RRGGBB` seeds:

```js
function packTheme({ light, dark }) {
  const bytes = [1, 0];
  const roles = ["primary", "neutral", "secondary"];

  [light, dark].forEach((mode, modeIndex) => {
    if (mode === undefined) return;
    if (!mode || mode.primary === undefined) {
      throw new Error("Each supplied mode needs a primary seed");
    }
    roles.forEach((role, roleIndex) => {
      const color = mode[role];
      if (color === undefined) return;
      if (typeof color !== "string" || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
        throw new Error(`Invalid ${role} seed: ${color}`);
      }
      const hex = color.slice(1).replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3");
      bytes[1] |= 1 << (modeIndex * 3 + roleIndex);
      for (let offset = 0; offset < 6; offset += 2) {
        bytes.push(parseInt(hex.slice(offset, offset + 2), 16));
      }
    });
  });

  if (!bytes[1]) throw new Error("Supply at least one primary seed");
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

console.log(packTheme({ light: { primary: "#0072b1" } })); // AQEAcrE

const themedUrl = new URL("https://dkarlovi.github.io/diapason/new");
themedUrl.searchParams.set("embed", "1");
themedUrl.searchParams.set("scheme", "dark");
themedUrl.searchParams.set(
  "theme",
  packTheme({
    light: { primary: "#28714b", neutral: "#657367", secondary: "#a15e35" },
    dark: { primary: "#83c49b" },
  }),
);
// Set your iframe's src to themedUrl.href.
```

Additional fixtures for implementations in other languages:

| Supplied colors                                                                                                                 | Packed value                  |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Dark primary `#000000` only                                                                                                     | `AQgAAAA`                     |
| Light primary/neutral/secondary `#000000`, `#112233`, `#445566`; dark primary/neutral/secondary `#778899`, `#aabbcc`, `#ddeeff` | `AT8AAAARIjNEVWZ3iJmqu8zd7v8` |

The development playground uses the same format and generates ready-to-paste
iframe snippets.

For a shared tune, start with its full URL and add these parameters; preserve the
`#tune=...` fragment. Theme parameters survive internal navigation, tune Save,
and refresh. Generated Share links contain musical content and omit appearance.
Themes are not stored in recordings, exports, or undo history.

Malformed packed values, unsupported versions, invalid masks, and values longer
than 27 characters use the app default as a whole. Invalid schemes use `auto`.
JSON theme query values are not accepted.
There is no parent messaging API or live host synchronization. Changing an iframe's
URL reloads it and interrupts any active recording.

Try [the development embed playground](http://localhost:5173/diapason/dev/embed)
for blue, forest, terracotta, plum, and bright-yellow presets, per-mode seed
pickers, optional neutral/secondary colors, and a light/dark/auto selector. The
surrounding page previews the same theme. **Reload studio** applies the settings
and regenerates an iframe snippet; it reopens the example tune or recording setup.

The [theme specification](docs/superpowers/specs/2026-10-29-seed-themes-design.md)
records the research and design rationale. The generator and semantic mappings
have automated contrast checks; palette generation alone is not a guarantee of
universal aesthetic preference.

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
- Capturing and correcting notes is local to the browser. Only WAV and MIDI files exported by
  diapason can be imported; plain WAV, MP3 and other files, and user-defined saved
  presets, are not yet available.
- Audio editors often drop unknown chunks when re-saving, so a diapason WAV edited
  elsewhere can no longer be imported.
- Restored takes reproduce the saved melody with matching analysis code. Imports
  from other versions retain saved evidence and report differing current analysis.

Feature ideas and planned work are tracked in
[GitHub issues](https://github.com/dkarlovi/diapason/issues).

Manual pitch editing follows the
[source-based design](docs/superpowers/specs/2026-10-26-note-editing-design.md)
and [implementation plan](docs/superpowers/plans/2026-10-26-note-editing.md).
A chosen MIDI pitch survives key, tuning, grid and preset changes. Splits inherit
it; resetting one child clears only that child's source coverage. Edited coverage
protects note boundaries from merges, even when neighboring pitches agree. Edited
notes are striped on the roll (muted ones in gray), including choices that now equal
the automatic pitch after a tuning change. A note whose pitch differs from detection
also shows a dashed outline where it was detected, linked to its edited position;
the selected note's link is drawn at full strength. Stepping back onto the detected
pitch, with a stepper, arrow key or drag, clears the edit, the same as Reset pitch.

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
