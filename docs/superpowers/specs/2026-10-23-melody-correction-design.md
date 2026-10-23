# Melody Correction ("Auto") Design

## Intent

diapason's users cannot read music and do not know what a key or scale is. They can whistle or
hum a tune mostly in tune and mostly in rhythm, and they want a MIDI file that sounds like the
tune they meant. Today the app rounds each detected pitch to the nearest semitone. When a note
is sung near the middle between two semitones, rounding flips it unpredictably, and short
glides between notes become extra notes. The result is a recognizable but "wrong-sounding"
melody.

The user's own framing: "I have a melody in my head, I can mostly whistle or hum it, I need
the tool to figure out how it sounds in my head from my rough input and optional knob tweaks."
The rough input is evidence, not the answer. The feature uses music theory on top of the input
signal to produce a good result even where the user could not sing it precisely. If the
surrounding melody and implied harmony make a note two semitones away more plausible than the
one sung, the engine chooses it. Every decision stays inspectable and adjustable: the user can
expand individual sliders and dropdowns and tweak until the result sounds best.

It works like auto-tune for transcription and never alters the captured audio. Users judge the
result by listening, never by reading the piano roll.

## Evidence that shaped the design

Two takes of the same tune, whistled by the user on 2026-10-23 at 95 BPM with headphones:

- Take 1: `src/fixtures/whistle-regression/original.wav` (existing fixture, schema-1 JSON). Its
  source files are the `~/Downloads/diapason-recording-oct-23-12-58-pm-*` set; no schema-2 export
  of take 1 exists, so take 1 cannot be replayed exactly and is used for analysis only.
- Take 2: `~/Downloads/diapason-recording-oct-23-02-02-pm-1792756984252.wav` with its schema-2
  JSON `…-1792756985301.json` and MIDI `…-1792756987679.mid`. It must be copied into a new
  fixture directory with a provenance manifest, as was done for take 1.

Measurements on take 2: the median pitch offset over all voiced frames is 2 cents (overall
tuning is fine), but per-note median pitch is up to ±50 cents from the assigned semitone, and
9 of 23 notes are more than 30 cents off. The output uses six adjacent semitones (D#–G#), a
chromatic cluster that a whistled tune almost never uses.

A matching phrase is detected differently in the two takes: take 1 gives G A F# F# G, take 2
gives G G# F F G# G. In take 2 (times from its JSON) the phrase runs G#6 at 13.54 s
(+18 cents), F6 at 14.17 s (+13), a 0.7 s rest, F6 at 15.33 s (+47, nearly F#), G#6 at 16.01 s
lasting only 0.11 s and sung −49 cents, then G6 at 16.12 s. The short G# is a glide back to G. The user
heard this as "a slipped finger".

A throwaway spike tried "detect notes, then snap out-of-key ones to the key" (key estimated
with Krumhansl–Kessler profiles; both takes came out E minor). The user's listening verdict:
on take 1 the two variants that also snapped timing to a grid sounded odd; on take 2 no variant
sounded good, because the slip is created during note detection and post-hoc snapping cannot
remove it. Conclusion: note decisions and musical sense must be made in the same pass.

## Goals

1. **One engine, fully replacing today's detection.** Replace "round, then fix" with a decoder
   that chooses the most likely note sequence given (a) the sung pitch evidence per frame and
   (b) music-theory expectations: notes in the tune's key are more likely, notes that fit the
   implied harmony at that point in the melody are more likely, small steps are more likely
   than large leaps, held notes tend to stay held, and very short excursions to a neighbouring
   pitch are unlikely. The sung pitch is not a hard constraint: context may move a note by
   more than one semitone. The standard technique is an HMM over semitone states plus silence,
   decoded with Viterbi (as in pYIN/Tony note tracking), extended with key and harmony priors.
   Today's `segmentNotes` path is removed; there is no second engine.
2. **Automatic key.** The key used as a prior is inferred from each recording. Auto must be
   right most of the time without any user action.
3. **A knob model, and presets as named positions of it.** The engine is controlled by roughly
   20–30 knobs (sliders and dropdowns). A preset is shorthand for a position of all of them,
   in the user's words "a preset of 20–30 different knobs". The knob families are:
   - _Listening_ — how much to trust the sung pitch versus musical expectation; how readily a
     held note stays held (the smarter Stickiness); how short a slip is absorbed; voicing and
     silence gates.
   - _Key and harmony_ — key (Auto or chosen), mode bias (major/brighter versus minor/darker),
     strength of the pull toward the key, strength of the pull toward notes of the implied
     harmony, how readily confident out-of-key notes are kept.
   - _Melody shape_ — preference for steps versus leaps; how far context may move a note from
     what was sung.
   - _Rhythm and feel_ — timing grid (off or a subdivision), how strongly onsets are pulled to
     it, swing, syncopation (displacing onsets off the beat), note length/articulation
     (legato versus detached).

   Two kinds of preset share this model, and every one is worked out per recording (the key,
   harmony and rhythm come from that recording; only the intention is shared):
   - _Intent presets_ recover the tune as meant: _As played_ (the same engine with music-theory
     priors off: the closest faithful transcription), _Gentle fix_ (resolve only ambiguous
     notes and slips), _Clean_ (strongest pull toward key, harmony and steady held notes),
     _Keep my odd notes_ (absorb slips and wobble but keep confidently sung out-of-key notes:
     the "blue notes are correct" intention).
   - _Mood presets_ reshape it toward a feel: _Happy_ (major/brighter mode bias), _Sad_
     (minor/darker), _Dreamy_ (legato, smooth stepwise motion, softer rhythm), _Syncopated_
     (onsets displaced off the beat). The builder may add moods if they fall out naturally.

4. **Preview by ear.** Each preset has a play control that renders the melody under that
   preset without changing anything. The user then either accepts it ("yes, that's it") or
   applies it as a starting point and adjusts the controls.
5. **Smarter Stickiness, one control set.** Correction lives in the existing editor tuning
   panel. The existing Stickiness control becomes the decoder's "held notes stay held"
   strength; there must not be two controls that mean overlapping things. Detection sliders
   that no longer influence the decoded result are removed or repurposed, not left inert.
6. **Key selector.** Default _Auto_. A few plausible alternative keys are offered, each
   previewable by ear; key names are shown small, for the curious. A full list of all keys is
   available behind an "I know my key" option for users who know theory.
7. **Per recording.** The chosen preset/controls/key are saved with the recording, like the
   tuning sliders and grid today. MIDI export, editor/library playback, diagnostics JSON and
   replay all use the same resolved result.

## Non-goals

- Changing the captured or exported WAV audio (no audible pitch correction).
- Tempo detection, polyphony, outputting chords, a new pitch detector, or an audio import
  screen. (Harmony is inferred only as context for choosing melody notes.)
- Matching a user's tune against a database of known songs.
- Saving user-defined presets (planned later; the stored preset-plus-overrides shape should not
  prevent it).

## Anti-goals (failure even if it technically works)

- The tune comes back cleaner but is a _different tune_.
- Deliberate notes are silently "corrected" with no way to get them back.
- The user needs music theory to get a good result.
- Two overlapping sets of controls (old stickiness plus new correction strength).
- A correction the user can't undo or adjust: every automatic choice must be reachable through
  an expandable slider or dropdown.

## Success criteria

- **Listening gate (blocking).** Before any UI work, the decoder's output for both takes under
  each preset is rendered to audio and the user confirms by ear that the best preset sounds
  like the intended tune and the take-2 slip is gone. If not, iterate on the decoder; do not
  proceed to UI.
- **Take agreement.** Under the default preset for new recordings, the two takes decode to the same pitch
  sequence through the shared phrase. Measure agreement as pitch-sequence edit distance and
  record it as a regression test once the user has approved the result by ear; the approved
  output becomes the expected fixture result. The user cannot name notes, so there is no
  hand-written target melody: agreement between takes guards against regressions, and the
  user's ear guards against both takes agreeing on the wrong tune.
- **Moods are audible and recognisable.** At the mood listening gate, the user can tell each
  mood apart by ear and it still sounds like their tune.
- **Slip absorbed.** The take-2 0.11 s G# at 16.01 s no longer appears as a separate note under
  Gentle fix, Clean or Keep my odd notes; the G at 16.12 s absorbs it.
- **No regression in faithful mode.** As played on take 1 still yields the 22-note reference
  melody without beat splits or overlaps (the guarantees from the faithful-MIDI work); tests
  tied to the removed segmenter's internals are replaced, not kept alongside.
- **Replay.** A schema-2 (or bumped) JSON/WAV pair exported with any preset replays as
  `match`, and the regenerated MIDI is byte-identical.

## Constraints

- Fully client-side, strict TypeScript, no new runtime dependency; the decoder is a pure module
  with unit tests; browser effects stay in hooks (see `AGENTS.md`).
- Deterministic: identical audio + settings ⇒ identical notes, so diagnostics replay keeps
  working. Bump the analysis pipeline version (`PIPELINE_VERSION` in `src/build-info.ts`) and
  the diagnostics schema as needed; record the preset, resolved key (and whether it was auto),
  and every effective decoder weight in the diagnostics stages.
- Must decode a several-minute recording interactively in the browser (slider changes
  re-run it today; the decoder should stay comfortably under ~100 ms for a 3-minute take, or
  run off the main thread).
- Muting: muted-note anchors (`MutedNote`, matched by time and ±1 semitone) must keep finding
  "their" note when the user switches presets or keys, including when a correction moves a
  note by a semitone.
- Do not grow Fallow duplication or health baselines; update `README.md` on the branch.

## Decided

- Auto by default; advanced choices (key list, weights) are available but optional. (User.)
- Presets are intentions with recording-specific effect. (User.)
- Smarter Stickiness, not a second control. (User.)
- Judging is by ear; previews must be one action to hear and must not apply anything. (User.)
- The new engine fully replaces today's detection. Existing recordings may sound different
  after the update; that is acceptable if they sound good. (User.)
- Music theory may override the sung pitch, including moves of more than one semitone, when the
  melodic and harmonic context makes that more plausible; the user can always adjust it. (User.)
- Presets may hide sliders or select different settlement strategies; expanding the details
  reveals the individual sliders and dropdowns. (User.)
- Legacy recordings with no saved correction setting open on the default preset for new
  recordings; their old tuning fields that still have a meaning are carried over and the rest
  are dropped. (My call.)
- The decoder runs on the existing per-frame pitch track (`Frame`: time, frequency, clarity,
  RMS); recordings need no new stored data. (My call.)
- Moods are part of this project, not a follow-up; a mood is a preset over the same knobs.
  (User.)
- Timing is in scope through the _Rhythm and feel_ knobs. Intent presets keep timing as sung
  by default, because grid snapping made the spike sound odd; mood presets may change it.
  The existing grid control becomes one of those knobs rather than a separate setting. (My
  call.)

- "Auto" names only the key selector's default. New recordings start on the preset the user
  picks at the listening gate as sounding best (expected to be Gentle fix or Keep my odd
  notes); the regression tests pin that preset. (My call.)
- The work is phased with listening hand-offs: (1) the engine and knob model as pure modules,
  with an offline render script producing a WAV and MIDI per take per preset, rendered as in the
  earlier spike (two octaves below the whistle, labelled); (2) the user listens to the intent
  presets and approves or sends back; (3) mood presets tuned and approved the same way; (4)
  persistence, diagnostics and UI. UI work does not start before (2) is approved. (My call.)
- A recording stores the preset name plus any user overrides, not resolved weights. Once the
  user moves a control, the preset reads "Custom (from <preset>)". Diagnostics record the
  preset, overrides, resolved key and every effective weight, so a later retune of a preset's
  defaults is a pipeline-version change visible in replay. (My call.)
- Muting after notes merge or split: a muted anchor mutes the note whose time span contains the
  anchor's time and whose pitch is within ±1 semitone; when merged notes contain any muted
  anchor, the merged note is muted. Anchors that match nothing are kept, not deleted, so
  switching back to another preset restores the mute. (My call.)

## Left to the builder

- The exact HMM formulation: state space (semitone range from the sound profile's
  min/max frequency), observation model (e.g. Gaussian in cents weighted by clarity), transition
  priors (stay, interval-size penalty, key membership, minimum note duration modelling), and
  how silence/unvoiced frames are represented.
- How the key is inferred (e.g. decode without a key prior, estimate key with
  Krumhansl–Kessler-style profiles from the result weighted by duration, decode again with the
  key prior) and how minor keys treat the leading tone.
- The exact knob list within the families above (aim for 20–30), their ranges and labels, and
  which are visible by default versus behind "expand".
- How implied harmony is inferred (e.g. a small chord vocabulary per key decoded per beat or bar
  from the note sequence) and how syncopation and swing are applied to onsets.
- The numeric weights behind each preset, tuned on the two takes and synthetic cases (held
  notes with vibrato, glides, deliberate chromatic notes, repeated pitches, leaps).
- Which existing detection sliders survive, merge, or go, provided the no-duplicate-controls
  rule holds and saved settings remain interpretable.
- Preview rendering: reuse the existing browser synth/MIDI playback path for previews.
