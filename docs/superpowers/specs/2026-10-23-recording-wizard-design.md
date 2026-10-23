# Recording wizard design

## Intent and agreed scope

Make New recording a progressive setup flow with consistent status elements, persistent calibration results, source-aware instructions, and an independent tempo step. Use **recording** throughout the application and its implementation. Replace take URLs directly; no aliases or redirects are required.

The shared live monitor combines input level and pitch. It also displays the beat/bar grid already available in the editor, scrolling with live audio rather than remaining static. Tempo can be entered, tapped, or detected from clapping.

Humming and instruments are future capabilities. This change establishes source profiles and a sound-choice step but initially exposes only whistling. Do not imply that widening the pitch range provides polyphonic music transcription.

## Flow

1. **Choose your sound:** explicitly confirm Whistling. Future profiles can supply humming/instrument instructions and detection parameters without replacing the wizard.
2. **Set up your microphone:** request access on a user action, select the device, set input gain, inspect processing settings, and confirm readiness. Show settings as shared status rows rather than badges with inverted ON/OFF semantics.
3. **Measure room noise:** collect approximately 1.5 seconds of silence. Show progress, sample validity, and an explicit **Low room noise** result. Merely finishing a timer is not a pass.
4. **Check your sound:** collect a short, bounded steady-note test. Require detectable pitch, clear tone, no clipping, and separation from the measured noise. Steadiness is advice, not a gate. Keep gain adjustment in microphone setup and room-noise recovery, with a shared control and clear remeasurement instructions.
5. **Find your tempo:** tap a button/Space, explicitly enable clap listening, or enter BPM. Show estimate stability, retry, half/double correction, optional metronome preview, and explicit confirmation. Choose beats per bar separately; do not infer meter from taps/claps.
6. **Record:** summarize valid setup, start a one-bar count-in, record on the downbeat, stop and save. Show distinct counting-in, recording, saving, and retry/error states.

Only the current step's full controls and completed summaries are visible. Completing a step reveals the next; completed summaries have Edit actions. Reopening a step alone does not invalidate results. First unmet prerequisite determines the active step when a dependency actually changes. Record eligibility is also enforced in the recording handler.

## Shared UI and persistent results

Use one status-row component for microphone settings, measurement checks, and readiness. States: Not checked, Checking, Passed, Needs attention; unknown settings are explicit. Use text/icons as well as color. These are measured results, not manually checked boxes.

Keep live observations separate from saved test results. Silence, claps, a wandering note, moving to another step, and metronome preview never overwrite completed sound or room checks. A failed explicit retest replaces its previous result so an old success cannot conceal a new failure. Persist results within this open wizard, not across reloads or devices without revalidation.

Dependency rules:

| Change                                                 | Invalidated                                                           |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| Microphone or stream loss                              | Microphone readiness, room, sound; stop microphone-dependent activity |
| Gain                                                   | Room and sound; meter/recording/calibration all use post-gain samples |
| Sound profile                                          | Sound only; preserve room with unchanged microphone/gain              |
| Room remeasurement                                     | Sound, because its noise reference changed                            |
| BPM or beats per bar                                   | Tempo confirmation only                                               |
| Transient silence, test tone ending, tap/clap activity | Nothing                                                               |

Preserve entered tempo values when earlier steps need repair. Do not require choosing the sound again after a device change. Cancel pending measurements on edits that invalidate their input; stale callbacks must not restore a pass.

## Live monitor and beat bars

Use the editor’s two-column layout: live monitor on the left, wizard on the right, stacking on narrow screens. Overlay “Connect your microphone to see live sound” inside the chart until connected. The monitor contains observations, not gain controls or explanatory bar-line captions.

Reuse the existing trace renderer and beat/bar styling. Show level, clipping, detected pitch, and contextual instructions from one microphone pipeline. Explain sound-without-pitch instead of displaying silence as failure. During room measurement request silence; during clap listening report detected beats.

Display a pitch-only chart before the user enters or detects a valid tempo; BPM starts empty. With a selected or estimated tempo show an unnumbered preview grid; confirmed tempo removes the provisional label. Emphasize bar boundaries and the current beat. Number bars only during count-in and recording; live preview has no absolute start and no time labels. Live frames, grid, audible clicks, and count-in must share an AudioContext time origin. Recording beat zero is the same downbeat used to trim saved audio; support negative count-in beats. Stopping preview stops audible clicks without stopping the live monitor. Tempo changes re-anchor the preview grid explicitly and do not shift an active recording. Preserve the editor's existing static rendering.

## Source profiles and stored recordings

One profile owns display labels, test instructions, detector options, analysis window/hop, and sound-check thresholds. Whistling starts with current pitch defaults (250–3000 Hz, clarity 0.9, window 2048, hop 512). Use it for live monitoring, editor/library analysis, and diagnostics. Store source ID and effective analysis settings on new recordings so future defaults do not reinterpret their audio.

Keep IndexedDB's existing recordings store and user audio. Absence of new source metadata on existing records means the current whistle defaults; this is data preservation, not a take URL compatibility layer. Do not rewrite user-authored recording names.

## Proposed implementation defaults

These are engineering starting values, not claims of validated acoustic limits. Keep them named and centralized; validate with real microphones before shipping:

- Room: collect 1.5 s, require at least 10 finite samples spanning at least 1.2 s, use 95th-percentile RMS as floor; pass at floor <= 0.01 with no clipping (peak >= 0.98 is clipping). Retain the existing gate formula separately: clamp(floor * 1.5, 0.003, 0.1). Empty/stalled sampling never passes.
- Sound: collect 2 s with at least 1.5 s of valid sample coverage; require >= 25% voiced frames, median voiced clarity >= 0.9, peak < 0.98, and median voiced RMS >= max(0.003, floor * 3). Show the existing +/-20-cent steadiness feedback as advice only.
- Raw processing: explicitly false passes; true needs attention and blocks readiness. An unavailable setting is unknown, never falsely OFF; allow an explicit acknowledgment of that limitation to satisfy readiness. Retry or change microphone for enabled processing.
- Tempo: integer BPM 40–220; beats/bar integer 1–12. Start BPM empty and beats/bar at 4 without marking tempo confirmed. Use at least 5 events (4 intervals), median interval, and median absolute interval deviation / median <= 0.15 for a usable estimate. Reject intervals outside supported BPM bounds; reset after a >2 s pause. Provide Start over for mistakes.
- Clap: derive onset timing from audio sample/context time, not UI frame arrival time. Adaptive noise-relative threshold, rising-edge detection, and 150 ms refractory period prevent one clap's tail from counting repeatedly. Stop metronome preview before listening; stop clap listening before preview/count-in. No background microphone tempo inference.

## Approaches and tradeoffs

The conversation selected a six-step wizard with a persistent shared monitor. Keeping all current panels open would preserve the competing checklists and unclear prerequisites. Reusing rolling live verdicts as setup gates would reproduce the regression after silence. Instead, pure workflow/measurement models own completed results while hooks own browser effects. This adds explicit state but makes progression and invalidation testable.

## Constraints and completion

Use React, strict TypeScript, Vite, existing Web Audio and canvas modules; no new runtime dependency is planned. Keep `/diapason/`, local IndexedDB recordings, one-bar count-in, MIDI/WAV exports, and click masking. Support keyboard operation, meaningful status announcements, narrow screens, and effect cleanup. Stop unrelated sound-producing playback before measurements/listening. Do not put implementation details in the user flow.

Out of scope: shipping humming/instrument profiles, polyphonic transcription, automatic meter detection, URL aliases, server services, and cross-visit calibration reuse. The user requested a plan; product implementation is a subsequent task. Acoustic defaults above and unknown-setting acknowledgment are proposed implementation decisions for review.
