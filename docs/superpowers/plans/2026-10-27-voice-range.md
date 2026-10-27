# Voice Range Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Calibrate singing/humming range in the existing sound check and display it on the live canvas.

**Architecture:** Pure range measurements feed revision-protected setup state. Optional preferred frequency bounds travel with acoustic analysis settings through live detection, saved takes and replay. Canvas shading uses those same bounds.

**Tech Stack:** React, TypeScript, Canvas 2D, Vitest and React Testing Library; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-27-voice-range-design.md`

## Global Constraints

- Keep the six-step recording setup; whistling keeps its steady-note check.
- Add a three-semitone margin at each end, bounded by the source profile.
- Clear evidence outside the personal range remains detectable; captured PCM stays untouched.
- Existing recordings without range preferences retain their saved behavior.
- Keep voice marked experimental pending higher-register recordings.

## Review Focus

- Interrupted or superseded measurements cannot install a range.
- Retrying either endpoint clears the old effective range until valid again.
- Extreme single-frame outliers must not define comfortable limits.
- Clear out-of-range fundamentals must not become in-range subharmonics.
- The band remains visible during silence and has accessible equivalent text.

### Task 1: Range measurement and acoustic preference

**Files:** Create `src/voice-range.ts`, `src/voice-range.test.ts`, `src/pitch.test.ts`; modify `src/pitch.ts`, `src/recorder.ts`, `src/recording-profiles.ts`, `src/recording-analysis.ts`.

**Interfaces:** `PitchRange = { minFreq: number; maxFreq: number }`; optional `preferredRange?: PitchRange` on pitch/analysis options; `measureVoiceEndpoint(frames, peak, floor, profile): EndpointResult`; `voiceRange(low, high, analysis): PitchRange | null`.

- [x] Add failing tests for stable median endpoints, glides/outliers, noise, invalid ordering, bounded three-semitone margins, low/high harmonic tones, and clear out-of-range fundamentals.
- [x] Run `npm test -- src/voice-range.test.ts src/pitch.test.ts`; expect failures for missing behavior.
- [x] Implement robust endpoint estimates and a conservative preference only for ambiguous candidates; validate optional bounds on saved analysis.
- [x] Run the focused tests; expect pass.

### Task 2: Setup state and sequential measurements

**Files:** Modify `src/recording-setup.ts`, `src/hooks/useMeasurements.ts`, `src/hooks/useRecordingSetup.ts`, `src/hooks/useMicrophone.ts`, `src/hooks/useCapture.ts`; test `src/recording-setup.test.ts`, `src/hooks/useMeasurements.test.tsx`.

**Interfaces:** Setup stores low/high endpoint results; range derives from passed endpoints. Sound actions carry optional low/high target. A normal sound measurement remains the explicit broad-default fallback.

- [x] Add failing tests for incomplete range, retries, invalidation on input/room changes, tempo retention, stale revisions and interrupted measurements.
- [x] Run focused state/measurement tests; expect failures for missing behavior.
- [x] Implement sequential low/high collection without biased calibration; update the detector when effective analysis changes and snapshot effective analysis when saving.
- [x] Run focused tests; expect pass.

### Task 3: Sound-check UI and live range

**Files:** Create `src/components/VoiceSoundCheck.tsx`; modify `src/components/CaptureControls.tsx`, `src/components/Capture.tsx`, `src/components/LiveMonitor.tsx`, `src/trace.ts`; extend `tests/capture-fixture.tsx`; create `src/components/Capture.voice.test.tsx`; extend `src/trace.test.ts`.

**Interfaces:** Voice sound check consumes endpoint state and targeted check actions. Trace accepts optional `preferredRange` and draws shaded bounds; LiveMonitor exposes the same range as text.

- [x] Add failing tests for low/high flow, retries, fallback sound check, saved preferred bounds, input invalidation, range labels and trace continuity outside the band.
- [x] Run UI/trace tests; expect missing UI/band failures.
- [x] Implement the two measurements in the existing panel, show calibrated bounds on the live trace, and include the range in auto-scaling during silence.
- [x] Run UI/trace tests and typecheck; expect pass.

### Task 4: Persistence, validation and documentation

**Files:** Extend `src/wav-metadata.test.ts`, diagnostics tests and source-profile tests; update `README.md` and this plan.

- [x] Add failing validation cases for malformed/reversed/out-of-band preferences; verify tagged WAV round-trip and diagnostics replay retain a calibrated range.
- [x] Run focused persistence tests, implement any missing validation, then expect pass.
- [x] Replay the two user-supplied voice WAV/JSON pairs and existing whistle regression tests; expect unchanged results without range fields.
- [x] Document the calibration flow, shaded band, fallback and limited voice validation.
- [x] Run `npm run check`; address any new failures without growing baselines.
- [x] Review the complete diff, then leave the dev instance ready for a real calibration trial. Do not publish or merge.

## Execution notes

- Continue in the existing dev checkout so the user's running instance sees changes; use a feature branch.
- User approved trying the design, including the live range band. Execute inline without another approval checkpoint.
- Existing uncommitted source-picker/profile changes are the authorized experimental spike and remain part of this feature.

## Validation result

Full `npm run check` passed, including coverage tests, Fallow gates and production build.
Real Web Audio browser checks passed at desktop, portrait and landscape sizes.
The supplied humming and singing WAV/JSON pairs still replay exactly.
Independent code review found one pending microphone/source-switch race; the
fix and its regression test passed, and review found no remaining important issues.
The dev instance remains available for a real microphone calibration trial.
