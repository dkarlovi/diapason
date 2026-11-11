# Studio guide

[Project overview](../README.md) · [Sharing and restoration](sharing.md) · [Limitations](limitations.md)

- [Record and organize takes](#record-and-organize-takes)
- [Microphone setup and calibration](#microphone-setup-and-calibration)
- [Melody correction](#melody-correction)
- [Edit individual notes](#edit-individual-notes)
- [Undo, redo, and saved versions](#undo-redo-and-saved-versions)
- [Playback and navigation](#playback-and-navigation)

## Record and organize takes

The Library at `/diapason/` stores recordings locally in IndexedDB. Preview audio
or MIDI, open a take by clicking its row, or use its actions menu to duplicate,
delete, or share it. Import or drag a Diapason WAV or MIDI file to inspect it before
saving; [sharing and restoration](sharing.md) explains the available import modes.

Choose **New** to open the recording setup at `/diapason/new`:

1. Choose your sound and connect a microphone.
2. Measure room noise, then check your sound.
3. Set tempo by tapping the button/Space, clapping, or entering BPM. Choose beats
   per bar and preview the metronome.
4. Record after the one-bar count-in. **Stop** saves a take and leaves setup ready
   for another, retaining calibration and tempo.

Below 120 BPM, a quieter click halfway after beats 3, 5, and subsequent odd beats
helps keep time. The beat indicator flashes with it. The click never blanks
captured pitches, and the original audio remains untouched.

Opening a take or requesting its MIDI preview starts analysis. Audio playback and
WAV download remain available while it runs; MIDI playback, editing, and export
become available when it finishes. Opening the same take reuses cached analysis.
Use **Retry analysis** after a failure. A cache quota warning leaves the analyzed
take usable; browsers without Workers may pause during long analysis jobs.

On supported mobile browsers, opening New or a recording requests fullscreen.
The header can toggle fullscreen; if it is unavailable or denied, the studio
continues in its normal view.

## Microphone setup and calibration

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

Whistling is the supported sound source in production. Each recording saves its
effective source settings. The detector is monophonic; mixed music and chords are
outside its scope.

### Experimental voice capture

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
Existing saved voice takes remain readable in production. Export a WAV
from the editor to contribute another validation sample.

Clap listening is explicitly started and stops before metronome preview or
recording. It requires AudioWorklet support; tapping and numeric input remain
available if microphone tempo detection fails. Microphone access needs localhost
or HTTPS. Audio and recordings remain local in IndexedDB.

## Melody correction

The editor's **MIDI** panel uses one engine for the piano roll, library/editor
playback, previews, diagnostics, and MIDI export. **Play** auditions a preset or
suggested key without saving it; **Use** applies it. Press Play again to stop a
preview. Starting another preview replaces it.

- **Intent:** each changes only what its name says. **As played** keeps your
  pitches and timing, **Auto pitch** corrects pitches and keeps your timing,
  **Auto timing** snaps to the eighth-note grid and keeps your pitches, and
  **Auto tune** does both.
- **Mood:** Auto tune with one change. **Major** and **Minor** recast the tune in
  that mode, and **Syncopated** pushes alternate beats an eighth early.
- **Key:** One dropdown contains Auto, three suggested alternatives, and all 24
  explicit keys, each with Preview and Use actions.
- **Controls:** Essentials groups Steadiness, Pull into key, Context correction,
  and Pull onto grid. Pitch includes key pull, Context correction, Mode, Smooth leaps, Max pitch move, and Glide. Rhythm holds
  Timing grid, grid pull, Swing, Syncopation, and Note length. Detection holds
  Steadiness, Level gate, Minimum note length, and Silence gap. Changing a control
  shows **Custom (from …)** and saves it. Each control has an explicit Reset
  button with a tooltip and accessible name; labels remain ordinary field labels.
  Preset, Key, Instrument, and Octave also have scoped Reset buttons.
  **Reset** asks for confirmation before restoring the current preset's controls
  and retaining the key. Reset actions can be undone, including resetting all note edits.
  Compact control rows retain their values and resets; explanations appear in tooltips.

Presets only supply control values; they never select hidden processing behavior.
The **Context correction** slider is available on every preset: 0% disables its
contextual scoring, and 100% applies its full correction.
**Auto pitch**, **Auto tune** and the mood presets set that slider to 100%;
As played and Auto timing start at 0%.
Context correction favors the natural
scale while allowing a minor key's raised seventh over the inferred major
dominant chord, and discourages large melodic jumps. **Pull into key** adjusts
the scale preference; **Smooth leaps** adjusts the melodic preference. It uses
the same note detection as Auto timing. It does not alter the recorded audio. Preview it before applying: it can change deliberate chromatic
notes, and it does not guarantee a correct transcription. As played and Auto
timing remain available for performances where those exceptions matter.

Gentle fix, Clean, Keep my odd notes, Happy, Sad,
Dreamy and the original Syncopated are retired: recordings and shared tunes that
use them still open with the same values and show the preset as retired, but
they are no longer offered. Each offered preset is checked to sound different
from every other one.
Older shared tunes remain readable with their saved control values. See the
[portable format](portable-tune-format.md) for interpretation version details.

**Glide** shapes motion within each detected note: **None (0%)** holds its target
pitch, **Coarse steps (20%)** uses two-semitone steps, **Fine steps (40%)** uses
semitone steps, and **Smooth (41–100%)** bends continuously. In the smooth range,
lower values hold each point's pitch longer before moving; 100% uses the whole
interval for movement. Point pitches and arrival times stay fixed. Arrow keys
move between the three stops and then in 1% increments through the smooth range.
The filled ribbon or stepped blocks show the sounding pitch, with a faint line
showing the note's destination. Each block belongs to the same editable note.

Changing Glide, including explicitly setting it to zero, opts into contour-aware
interpretation. Within that interpretation, changing the amount preserves note
segmentation. Older recordings and presets keep their saved behavior until you
use the control. Original audio stays unchanged.

## Edit individual notes

With Glide in the smooth range, selecting a note exposes white bend handles and a
solid destination marker. Drag a white handle vertically to change its pitch or
horizontally to change its arrival time. The final destination stays fixed.
Whole-note pitch edits transpose the contour; timing changes scale it with the
note. **Reset bend** restores the automatic contour. Bend gestures are one Undo
step and support keyboard adjustment; Escape, lost pointer capture, or a second
touch cancels an unfinished gesture.

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
synth playback fades out. Click empty canvas or outside the menu, or press Escape, to dismiss it.
Note IDs (for example, **Note #13**) follow the current detected sequence and
also appear in the CLI JSON and text reports; muting does not renumber them.
Detection changes that split or merge notes can renumber the sequence. Focus the roll and use arrow keys or Home/End to select
and audition notes, Up/Down to change the selected note's pitch by a semitone
(Shift for an octave), Enter/Space to replay, and M to mute/unmute. Ctrl/Cmd+click
also toggles mute. Muted anchors survive preset changes. Tune's divider supports
Left/Right, Home, and End. Tuning categories share a row when space permits
and wrap on narrower sidebars. Mobile auditions reveal and focus the roll; reopening
Tune returns to the last menu.

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
notes once, for browser playback, external MIDI playback, and MIDI downloads,
without changing stored pitch. The roll and note details show the sounding pitch,
including while an octave or version is previewed; on a change the pitch axis scrolls
by the shift (instantly with reduced motion) while the original-audio trace stays put. Original audio stays untouched. Timing and velocity
editing remain deferred.

## Undo, redo, and saved versions

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
after navigation. The stored recording is the authoritative state and every open editor
shows it: whichever tab or embed saves last wins, and the others switch to that state,
name, undo history and versions without a reload. An editor that still has an edit in
progress or a save waiting keeps its own state; that save lands next and reaches every
other editor the same way. A recording deleted elsewhere closes its open editors. Closing the page
can lose unsaved changes or an unfinished gesture; only completed database writes
are durable. Duplicates start with the current intent and no saved versions or undo history.
Deleting a recording also deletes its versions.

Versions stay in this browser. WAV export/import carries the captured
take and current musical edits, but excludes undo history and named versions. Versions preserve settings rather than a
frozen processing engine, so later app updates can change how an old version sounds.

## Playback and navigation

The editor at `/diapason/recording/:id` shows the original-audio trace and MIDI
piano roll. **Show/Hide original** toggles the audio track; phones start with it
hidden. **Tune** opens the resizable correction panel. **Trace overlay** draws
acoustic evidence over the notes when audio is available.

Use Time zoom, Pitch zoom, and Fit to navigate. Middle-button drag pans both
axes; Ctrl+wheel zooms time around the pointer and Shift+wheel changes note height.
On touchscreens, drag to pan; pinch horizontally to zoom time and vertically to
change note height. Playback follows the playhead through the uncovered canvas.

The roll shades rows outside the effective key and marks out-of-key notes with an
exclamation badge, including muted and edited notes. Previews use the previewed key;
minor accepts both natural and raised sevenths. These guides do not change notes.
For new recordings, an explicit Key takes precedence over Mode. Mode recasts
only an automatic key. Key supplies a per-note prior controlled by Pull into key;
at zero pull, selecting a key leaves pitches unchanged. Key does not refit the
performer's tuning or transpose the take. Older saved tunes retain their original
interpretation, where Mode can override an explicit key and key selection can
refit tuning. The Key dropdown shows the effective key used by the decoder.
See [interpretation versions](portable-tune-format.md).

The header's **MIDI out** picker routes note playback to the browser synth or an
external synth/DAW via Web MIDI when supported and permitted. Both outputs support
instrument selection and an octave shift. Changing the output or connecting or
disconnecting a MIDI output stops playback; opening a port for its first playback
keeps the transport running. Diapason MIDI downloads preserve both
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
