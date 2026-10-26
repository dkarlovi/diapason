# diapason

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who can carry a tune by whistling but cannot play an instrument. They want
to capture a melody and turn it into usable MIDI for further music-making.

## Product Purpose

Turn a whistled musical idea into editable notes and a downloadable MIDI file.
Success means the user can record, listen, refine the interpretation, and export
a usable melody without needing instrumental performance skills.

## Positioning

A browser-based whistle-to-MIDI studio combining guided microphone calibration,
monophonic pitch capture, melody correction, and comparison of original audio
with interpreted notes. Processing and recordings remain local to the browser.

## Operating Context

- Library: retain recordings locally, preview audio or MIDI, reopen, duplicate,
  and delete takes.
- Recording: choose the sound source, connect the microphone, check room noise
  and the signal, establish tempo, and record after a count-in. Keep setup ready
  for another take.
- Editor: compare original audio with MIDI, audition corrections, adjust notes
  and rhythm, and export the result.
- Microphone access requires localhost or HTTPS. Desktop and mobile browsers
  share the web application; preserve the `/diapason/` base path.

## Capabilities and Constraints

- Keep the scope small and iterate within the whistle-to-MIDI workflow. The user
  confirmed no additional product constraints during initialization.
- Whistling is the supported input. Detection is monophonic; chords and mixed
  music are outside the current scope. Humming and instrument input are future
  possibilities, not available features.
- Audio processing runs client-side. Recordings persist in IndexedDB rather than
  an account or server; persistence is specific to the browser's local storage.
- Preserve original captured audio when changing melody interpretation or notes.
- Support audio/MIDI comparison, melody and timing controls, manual pitch edits,
  note muting, and MIDI/WAV exports. Previewing alternatives does not save changes
  or change exports.
- Browser synthesis provides playback; external MIDI output depends on Web MIDI
  support and permission.
- Pitch and melody interpretation can be uncertain. Keep audition and correction
  available; do not promise perfect transcription.
- Audio file import and user-defined saved presets are not currently available.

## Brand Commitments

The product name is lowercase **diapason**, referring to tonal compass and the
historical tuning-fork pitch reference. The existing mark is implemented in
`src/components/DiapasonMark.tsx`.

## Evidence on Hand

- `README.md`: implemented workflows, browser requirements, and known limitations.
- `docs/design-principles.md`: the existing studio's design and interaction
  agreements.
- `prototypes/editor-directions.html`: interactive editor layout studies using a
  generated demo melody; these are prototypes, not evidence from user recordings.
- `src/`: the shipped implementation and colocated behavior tests.

## Product Principles

1. Make a usable MIDI melody accessible through whistling.
2. Keep capture, processing, and recordings local to the browser.
3. Preserve the original performance while allowing interpretation to change.
4. Let users hear and compare changes before committing to them.
5. Improve the small recording-and-editing workflow through focused iteration.
