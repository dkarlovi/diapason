# Recording workstation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in the current session. The user approved the prototype and requested implementation.

**Goal:** Apply the approved Slate & blue Recording workstation to the live app.

**Architecture:** Keep the audio/calibration hooks and storage pipeline. Replace
the capture presentation with one persistent monitor and wizard, using semantic
theme tokens, Tailwind, and shadcn style button primitives. Preserve browser
permission checks, calibration invalidation, and automatic opening of saved takes.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, shadcn/ui button conventions,
Lucide icons, Vitest, React Testing Library.

**Spec:** `docs/design-principles.md`; approved `folding-wizard-v8.html` prototype
in `.superpowers/brainstorm/105545-1792787525/content/`.

## Global constraints

- Recording screen first; Library and Editor keep their existing layouts.
- Slate & blue, system light/dark themes, no theme switcher.
- 16px body, 14px controls; only step summaries may use 11px text.
- Record is available only after setup; one Record/Stop button in the wizard.
- Preserve `/diapason/`, IndexedDB data, raw audio, count-in, and exports.
- Keep the existing checkout on the `recording-workstation` feature branch so
  the user can open the live app here; no additional worktree.

## Review focus

- Gain/device/disconnect invalidation must prevent recording until rechecked.
- Count-in/starting/saving must not allow duplicate starts or unsafe device edits.
- Unknown browser DSP settings must still require deliberate acknowledgment.
- Short viewports, browser zoom, keyboard focus, and reduced motion must stay usable.
- Beat feedback must use the audio clock, including preview and count-in.

### Task 1: Persistent wizard and transport controls

**Files:** `src/components/Capture.tsx`, `CaptureControls.tsx`, `TempoSetup.tsx`,
new `CaptureSteps.tsx`, `capture-presentation.ts`, capture/tempo tests.

- [x] Add behavior tests for all six steps, disabled future navigation, first-step
      Back absence, inline summary updates, and the single recording toggle.
- [x] Verify the new assertions fail against the existing UI.
- [x] Keep one wizard mounted; preserve horizontal step numbers and active state;
      move action controls to a fixed footer and provide compact step summaries.
- [x] Give clap listening and metronome preview one reversible button each.
- [x] Verify capture/tempo regressions including calibration failures and disconnects.

### Task 2: Theme, workstation shell, and live canvas

**Files:** `src/main.tsx`, new `components/AppShell.tsx`, `ui/button.tsx`,
`src/lib/utils.ts`, `theme.css`, `capture.css`, `styles.css`, `trace.ts`,
new `components/LiveBeat.tsx`, `LiveMonitor.tsx`, `useAudioClock.ts`, Vite config,
package lock, live monitor and clock tests.

- [x] Test meter order, clipping feedback, beat display, and unknown tempo states.
- [x] Add Tailwind and a shared shadcn style button foundation; keep legacy screens
      working while scoping the new visual layout to Capture.
- [x] Add the compact header, inline fields, permanent live plot, horizontal level,
      pitch overlay, and beat feedback based on the running AudioContext clock.
- [x] Fold wizard content on recording while keeping the same button and step 6
      mounted. Restore on stopping; preserve the existing save-to-editor navigation.
- [x] Use live chart theme tokens and redraw correctly as its container resizes.
- [x] Verify responsive layouts, theme changes, keyboard operation, and reduced motion.

### Task 3: Documentation and verification

**Files:** `README.md`, `docs/design-principles.md`, plan progress.

- [x] Document the resulting Recording behavior and the incremental design rollout.
- [x] Run `npm run check`; fix regressions without growing Fallow baselines.
- [x] Review the complete change and inspect real browser renders in both themes,
      including a calibrated simulated recording and the folding transition.

## Execution decisions

- The user has explicitly authorized applying the design; continue inline without
  another plan approval round.
- The prototype's Stop restores the wizard. Production retains saving and opening
  the editor; the wizard unfolds during stopping/saving and remains available if
  capture is too short or saving fails.

## Verification

- `npm run check`: passed, 50 test files / 250 tests; no baseline growth.
- Browser: synthetic microphone through calibration, count-in, recording, save,
  and editor opening; no runtime errors.
- Browser: both system themes, matching Record/Stop coordinates, and 390×560
  settings access checked.
- Fresh code review: Important findings resolved and rechecked.
- Existing replay integration tests now allow 15 seconds under coverage; their
  MIDI byte comparisons remain unchanged.
