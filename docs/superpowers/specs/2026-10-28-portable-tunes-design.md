# Portable tunes through URLs and Diapason MIDI

Issue: [#37](https://github.com/dkarlovi/diapason/issues/37). This design replaces
the issue's original clipboard workflow, which required the same audio recording
on both devices.

## Intent

Send the current state of a Diapason tune to a friend so they can hear it and then
fiddle with it using the controls supported by its source data. Neither device
needs a server account, and the recipient does not need the original audio.

A shared URL and a Diapason MIDI file carry the same editable tune payload.
Opening a link starts an import offer on the Library page. It does not open the
editor or save a recording merely because the recipient followed the link.

## Goals and agreed behavior

- Share the current musical settings, pitch corrections, and mutes together with
  enough baseline note information to reproduce and further adjust the melody.
- Preserve edits as edits. Corrected notes remain marked, muted notes remain
  present, and resetting a pitch override returns to the automatic pitch under
  the tune's current musical settings.
- Preserve fixed detected note boundaries while allowing supported musical
  adjustments. Audio-detection decisions are baked into the baseline.
- Prioritize small URLs through a custom binary format, integer timing, compact
  fields, and compression where beneficial. A URL does not contain a MIDI file.
- Accept rounding note starts and durations to the nearest millisecond.
- Support importing only MIDI files carrying recognized Diapason metadata.
- Derive control availability from the actual source information. Unsupported
  controls remain visible, disabled, and accompanied by an explanation.
- Carry no undo history, saved versions, or previous commits. An imported tune
  begins a fresh local editing session; subsequent user changes use normal local
  undo and history behavior.
- Instrument and playback octave are required semantic payload fields. The
  recipient must hear and see the sender's applied choices as closely as the
  supported source permits, including the selected preset/key, control values,
  pitch-edit markings, and mutes. Device MIDI routing, transient auditions,
  selection, and viewport position are not transported. Synth output is not
  required to be sample-identical across devices.

## Non-goals and anti-goals

- Transporting audio, acoustic analysis frames, or an audio waveform.
- Arbitrary MIDI import, multitrack arrangement, or general MIDI compatibility as
  an editor input. These may never be implemented.
- Changing the existing tagged WAV round trip or including edits in that format.
- Applying an imported tune over an existing local recording, collaboration,
  automatic synchronization, or merging edits from different devices.
- Flattening edits into final notes so that their identity or reset behavior is
  lost, inventing analysis frames from notes, or pretending missing audio exists.
- Silently writing to IndexedDB on link navigation, overwriting local tunes, or
  applying musical transformations twice on MIDI import.

## Approaches considered

1. **Full analysis frames plus edits.** Most closely reuses the existing pipeline
   and retains detection controls, but carries many measurements per second.
   Rejected in favor of much smaller note-level data and reduced capabilities.
2. **A complete MIDI file encoded into the URL.** Could reuse one file container,
   but adds standard MIDI structure and a rendered sequence to the editable
   payload. The user explicitly rejected MIDI in URLs.
3. **A compact, shared tune payload with URL and MIDI wrappers.** Selected. URLs
   carry only the compact payload; MIDI embeds that payload alongside playable
   standard events. Both restore the same editable state.

## Source model and musical processing

Introduce a first-class note-backed source alongside the existing audio-backed
recording source. A note-backed source is durable recording data, not a cache
that the app may discard and regenerate from audio.

Today `interpretMelody` first calls `segmentMelody`, then derives tuning, key,
harmony, note pitches, and rhythmic feel. The compact source belongs at the
boundary after segmentation and before musical interpretation. Existing
`Segment` data already includes source coverage, start, duration, and a
fractional semitone pitch. Refactor the musical interpretation stage so both
analysis-derived segments and stored segments can use it.

The payload must retain sufficient information for:

- The fixed segments produced using the sender's current detection settings,
  including boundaries protected by existing manual edits.
- Baseline pitch evidence and the range/context needed for supported pitch
  interpretation. Integer MIDI pitches alone must not be assumed sufficient:
  `fitTuning`, key selection, and pitch labeling currently use fractional pitches.
- Original performed timing before grid, swing, syncopation, and articulation.
- Tempo, meter, total duration including trailing silence, and the time origin.
- Current resolved musical settings, playback instrument and octave, manual pitch
  overrides, and muted-note membership.
- Name and format/interpretation versions needed to identify and restore a tune.

Interpret baseline notes with the current supported musical settings, apply
rhythmic feel, apply manual pitch overrides, and exclude muted notes from
playback/export, preserving today's processing semantics. Existing manual
overrides take precedence over automatic pitch changes.

Fixed base notes allow compact per-note edit references rather than repeatedly
encoding time ranges. The implementation must map existing range-based pitch
edits and mute anchors to those stable notes correctly. Resetting overrides must
not remove fixed boundaries or rerun acoustic segmentation. Preserving historical
edit IDs or currently inactive range edits is unnecessary: the goal is the current
state and its supported future edits, not recovery of discarded detection data.
This last rule is a design call for review, not an explicit user decision.

No synthetic audio Blob, fake sample rate, or fake waveform should be required to
make note-backed records work. Update persistence and consumers to represent
missing audio explicitly. Such a tune must survive refresh, duplication,
re-export, and re-sharing without acoustic analysis or an analysis-cache entry.

## Capabilities and unavailable controls

Capabilities come from validated source data and the processing stages it can
support, not the filename, route, or whether an item was imported. The following
is the agreed initial note-backed capability set:

| Available                           | Unavailable without analysis/audio     |
| ----------------------------------- | -------------------------------------- |
| Key selection and mode              | Steadiness                             |
| Pull into key                       | Minimum detected note length           |
| Smooth leaps and max pitch move     | Silence-gap bridging                   |
| Timing grid and grid pull           | Level gate                             |
| Swing, syncopation, and note length | Original audio playback                |
| Pitch edits, reset, mute and unmute | Original WAV download                  |
| Synth/MIDI playback and MIDI export | Audio waveform and acoustic reanalysis |
| Playback sound and octave           | Audio-based diagnostics                |

Each setting/action declares its data requirements. The editor uses a common
capability resolver, including action handlers and preset previews, so disabling
a visible control is not the only protection. The Library uses the same source
knowledge for playback and background work. Existing audio-backed tunes retain
their supported behavior.

Disabled controls explain the missing information in accessible text, not only a
hover tooltip. Example: “Requires pitch analysis. This tune contains fixed notes.”
Audio actions explain that the original audio was not included. The source is
identified as a tune without audio rather than shown as a failed analysis job.

Presets apply and preview only supported musical settings on fixed-note sources.
They never change segmentation, reactivate unavailable controls, or imply that
the frozen listening settings were applied. Explain that their detection settings
do not apply to this tune. Reset actions respect the same capability rules.

## Library-centered sharing and import

### Creating a share

Design call: provide **Copy tune link** and Diapason MIDI download in each Library
item's actions. Existing editor MIDI export writes the same tagged MIDI format;
sharing uses the same payload builder wherever invoked.

Capture one coherent committed state. Pending saves must complete before reading
the record; failures must be surfaced rather than sharing stale or mixed state.
An editor invocation finishes the current edit gesture before capture. Temporary
preset auditions are not applied settings and must not accidentally be shared.

Copy a self-contained URL rooted at `/diapason/`, with a recognizable payload in
its fragment, for example `#tune=...`. This is a Library entry point, independent
of sender-local recording IDs. No upload, URL shortener, or hosted tune is needed.
Report success only once the clipboard write succeeds; offer a selectable link
if clipboard access fails. Oversized tunes can still be downloaded as Diapason
MIDI; do not silently truncate a link.

### Receiving a tune

1. Opening the link loads the Library and validates an in-memory import candidate.
   Reading the existing Library is allowed; no candidate record, analysis, edit
   history, or version is written before confirmation.
2. Show the Library import offer with the tune's name, tempo, meter, duration, and
   a clear “No original audio” explanation. Offer **Import** and **Cancel**.
3. File selection/drop for Diapason MIDI feeds the same candidate/confirmation
   flow as URL input and integrates with the existing tagged WAV import UI.
4. **Import** saves a complete note-backed tune with its current settings and
   edits. **Cancel** saves nothing. Storage failure leaves no partial tune and
   presents a useful error.
5. Stay on the Library after import, refresh its items, and show success with an
   optional **Open** action, matching the existing WAV interaction. MIDI playback
   is available from the Library without opening the editor. No autoplay.
6. Imported tunes receive fresh local IDs and history roots; a sender's ID never
   overwrites an existing record. Design call: repeated offers may import another
   copy after another explicit confirmation; automatic deduplication is out of
   scope. Existing WAV identity/deduplication behavior is unchanged.
7. Design call: clear the consumed tune fragment after import or cancellation so
   a subsequent refresh does not repeat the offer. A reload before either choice
   can reconstruct the offer from the original URL without saving anything.

File imports keep the existing multi-file review behavior. URL import represents
one tune. Exact popover layout and interaction with an already-open candidate
batch are implementation decisions; a new offer must not save the old one.

## Binary payload and transport wrappers

Use one versioned semantic payload and binary codec for both transports. Required
format properties include an unambiguous Diapason identifier, schema version,
interpretation compatibility information, and an explicit compression indicator.
Unknown or unsupported versions must fail clearly rather than use current
defaults and silently change the tune.

Packing techniques to evaluate include delta-coded integer millisecond times,
variable-length integers, bit-packed flags and bounded enums, sparse pitch
overrides, a mute bitmap, and omission of defaults defined by the payload version.
Defaults must be versioned; do not depend on whatever a future preset happens to
contain. Resolve settings as needed to preserve their actual behavior.

Preserve sufficient pitch precision for identical integer output pitches and
correct reset behavior. Start with lossless fractional pitch storage if necessary;
choose a smaller representation only after measuring musical parity. Precision
is an implementation choice, not permission to silently change note decisions.
Guard millisecond rounding against zero-length notes, reordered boundaries, or
different edit membership. Preserve additional minimal context if rounding near
a musical decision boundary would change a pitch. Final timing may differ by the
agreed millisecond quantization; transformations must not accumulate drift.

Compare compressed and uncompressed bytes including overhead, use the smaller
form, and encode URL bytes as unpadded base64url. Exact field layout, codecs,
compression threshold, checksum, and validated input/URL limits belong to the
builder. Document the resulting format and measure representative fixtures before
fixing those choices. Avoid claiming a universal shareable URL length: browser
and message-app behavior must be checked against a conservative supported limit.

### Diapason MIDI

Keep the normal MIDI events as the current finished audible melody, with tempo
and meter. Embed the compact editable payload using a standards-compliant,
identifiable application metadata mechanism. Files remain playable outside
Diapason; ordinary playback ignores the private edit recipe.

Diapason import restores the embedded baseline/settings/edits, not the rendered
events as another baseline. Reject missing, damaged, incompatible, or conflicting
Diapason payloads with a clear explanation; do not fall back to generic MIDI
import. Validate that the standard rendered track matches the payload under the
declared format's timing resolution, so stale private metadata cannot silently
discard external changes. Externally modified or metadata-stripped MIDI is not a
supported round trip. Exact metadata placement and consistency checks are
implementation choices.

## Validation and persistence constraints

Validation happens before confirmation and bounds encoded bytes, decompressed
bytes, note counts, strings, durations, numeric values, and edit references.
Reject malformed flags, truncated integers, nonfinite values, impossible timing,
unsupported capabilities, and unsupported versions. Derive capabilities from
validated source fields rather than trusting claimed capability flags.

Persistence must save source notes and the applied state atomically. Initializing
any required local history machinery is allowed only at explicit import; the
sender's history is never transported. Audio cache invalidation must never make a
note-backed tune unusable, and future version incompatibility must not trigger
an impossible attempt to reanalyze missing audio.

Use pure modules for the source model, capabilities, interpretation, validation,
and codec; hooks own clipboard, routing, file access, and database effects.
Preserve the `/diapason/` base path and existing local audio recordings.

## Acceptance and verification

- A sender changes musical settings, corrects pitches, and mutes notes. A fresh
  browser imports either transport and hears the same note pitches, mutes, and
  playback sound, with timing preserved to the agreed resolution.
- Opening a URL, inspecting a file, canceling, and rejecting invalid input do not
  write candidate state to IndexedDB or open the editor.
- Explicit import adds a new Library item, stays on the Library, and makes MIDI
  playback available without audio decoding or acoustic analysis.
- Corrected notes remain marked. Resetting an override recomputes from the current
  supported musical settings. Unmuting restores the retained note.
- Every supported musical control works from stored baseline data. Unavailable
  controls and actions stay disabled with accessible explanations; presets and
  programmatic actions honor the same restrictions.
- Reload, duplicate, re-share, and MIDI export/import retain behavior and edit
  semantics. An empty analysis cache cannot break a note-backed tune.
- No sender history or versions arrive. Subsequent recipient edits support normal
  fresh-session undo behavior. Existing audio/WAV workflows continue to work.
- Round-trip fixtures exercise fractional pitches, key/mode changes, pitch
  shaping, grid/swing/syncopation/articulation, protected boundaries, mutes,
  trailing silence, empty melodies, and rounding boundaries. MIDI remains
  playable with private metadata ignored.
- Codec checks cover malformed/oversized input, version rejection, edits, and
  transport equivalence. Report encoded URL lengths and compare packed versus
  straightforward serialized data on representative short and long tunes.
- During implementation, update README behavior and limitations, run focused
  behavior/regression tests and `npm run check`, and keep Fallow baselines from
  growing. This design document alone does not announce unimplemented features
  in the README.

## Implementation discretion and approval

The builder chooses exact binary packing and limits, supported compression,
metadata framing, internal module boundaries, migration mechanics, and detailed
UI layout within these requirements. Benchmarking compactness and validating
musical equivalence are required before settling precision and packing choices.

Design calls made here for review: Library share actions, fresh local IDs,
explicit repeat imports creating copies, no transport of inactive historical
range edits, clearing the fragment after a decision, and checking rendered MIDI
against its embedded payload. These can be revised without changing the central
product intent. Implementation begins only after design approval.
