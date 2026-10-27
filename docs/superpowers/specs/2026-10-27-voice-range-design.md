# Singing and humming with personal range calibration

## Intent

Support recording sung and hummed melodies through the existing source-profile
system. Learn the performer's comfortable range inside the existing sound-check
step. Keep the six-step recording setup.

The user supplied one humming and one singing take. Both replay exactly from
their WAV/JSON pairs. The singing take produced 29 notes, and the user reports
that playback mostly matches the performance. These samples validate one adult
male voice; they do not establish performance for higher registers.

## Agreed flow

For Singing / humming, replace the single steady-note check with two measurements
in the same sound-check panel:

1. “Sing or hum your lowest comfortable note.” Capture for two seconds.
2. “Sing or hum your highest comfortable note.” Capture for two seconds.

Each measurement starts on a button press so the performer can prepare. Show
progress, the detected note, and the existing sound-quality checks. Allow retrying
either measurement. Finish this setup step once both usable measurements pass.
Whistling retains its current steady-note check.

Following the microphone trial, use the studio's compact label/control rows for
endpoint results and secondary Retry controls. The footer offers the next low/high
measurement while calibration is incomplete, and Continue when revisiting a passed
check. Continue preserves the calibrated range. The default-range fallback belongs
inside the panel as a secondary option and is hidden after success. Show failures
with the shared checklist rather than duplicate successful checklists or native
disclosure sections for both endpoints.

Show the effective range, including its margin, as a subtle shaded band on the
live pitch canvas with labeled low/high boundaries. Keep the trace visible both
inside and outside it. Include the band in the visible pitch extent even when
the performer is silent, and expose its meaning in accessible text. Show it as
soon as both endpoints pass, before recording starts.

## Approaches

- Keep the broad voice profile alone: simplest, but does not use personal range.
- Set hard detector boundaries from two notes: simple, but can reject genuine
  notes outside calibration or reinforce an octave error in a measurement.
- Use the measured range as a soft preference: recommended in the conversation;
  the user's latest direction places both measurements in the existing step.
  This requires carrying the preference consistently through live and saved
  analysis, but keeps clear pitches outside the range available.

## Proposed implementation decisions

- Use the broad voice profile while calibrating, without a previous range bias.
- Estimate each endpoint from reliable voiced frames rather than isolated extrema.
  Retain the existing level, clarity, clipping, noise and audio-coverage checks.
- Require a stable endpoint and a high endpoint above the low endpoint. Explain
  a failed result and allow retrying it; do not silently exchange endpoints.
- Add a three-semitone margin at each end, bounded by the broad source profile.
  This is an implementation proposal, not a measured optimum.
- Use the resulting range only to help choose between otherwise credible pitch
  candidates. Clear evidence outside it must remain detectable. Do not transpose
  every detected note into the range.
- Keep a broad-default fallback in this same panel for people unable to provide
  reliable endpoints. A normal sound-quality check remains required for recording.
- Keep microphone processing disabled and captured PCM untouched.

## State and persistence

Keep both endpoint results in setup state. Starting a new low measurement clears
the old effective range immediately. Changing source, microphone, gain or room
calibration invalidates the personal range; tempo changes preserve it. Interrupted
or obsolete measurements cannot install results.

Store effective range preferences with each recording's source analysis settings.
Use identical settings in live monitoring, saved analysis, library/editor playback,
diagnostics, WAV import/export and replay. Optional fields must be validated at
import. Existing whistle recordings and experimental voice recordings without
range preferences retain their saved behavior.

## Validation and limits

Exercise low and high synthetic fundamentals, harmonics, octave ambiguity, noise,
and clear out-of-range tones. Cover sequential calibration, retries, interruption,
fallback, invalidation, persistence and WAV/diagnostics replay. Replay both supplied
voice samples and existing whistle regressions. Run npm run check before submission.

Personal range is a pitch-detection aid, not a guarantee of intended notes or
boundaries. Keep the voice source marked experimental until higher-register
recordings have been checked. No extra wizard steps, demographic presets,
accompaniment or chord transcription are included.
