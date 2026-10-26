# Capture canvas layout implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this focused layout change inline.

**Goal:** Integrate capture into a canvas workspace and keep setup actions reachable, preserving the stationary Record/Stop control during wizard collapse.

**Architecture:** Keep the mounted monitor, wizard, and recording toggle. Use an uncapped 50–50 split between the wizard and canvas, stacked on phone portrait. Fix the wizard content width and align it to the right while its visible dock shrinks during recording; portrait collapses vertically against the same bottom action row.

**Tech Stack:** React, TypeScript, CSS, Playwright Chromium, Vitest.

**Spec:** The approved proposal: extend the editor’s canvas layout to recording, keep actions visible, use two columns with compact step indicators in short landscape, and retain the collapsing wizard with a stationary Stop button.

## Global constraints

- Preserve wizard collapse, live view expansion, and mounted canvas/toggle.
- Keep Record/Stop coordinates unchanged throughout recording transitions.
- Hide step labels and summaries only on short landscape screens.
- Preserve accessible step names, active-step context, input labels, and the `/diapason/` base.
- Update README; no dependency changes or commits required.

## Review focus

- Short landscape actions must fit without document scrolling.
- Portrait dense steps must scroll internally with reachable controls.
- Record/Stop must remain stationary during animation and after restoration.
- Rotation and reduced motion must retain usable controls.
- Shared editor/library header styling must remain compatible.

## Task 1: Integrate and verify capture layout

**Files:** Modify `src/capture.css`, `src/components/Capture.tsx` if active-step heading needs a styling hook, `src/components/CaptureActions.tsx`, and `README.md`.

**Interfaces:** Preserve existing component props, capture state, and data-recording styling hook.

- [x] Extend the existing temporary Playwright audit with failures for offscreen actions, document overflow, and Record/Stop movement; run before changes to confirm landscape failures.
- [x] Remove card framing, bound the wizard dock, and consolidate portrait/short-landscape rules. Retain right/bottom anchoring through collapse.
- [x] Verify all six steps and recording at the 18 audited sizes, including start/stop animation coordinates, scroll reachability, rotation, and reduced motion. Inspect screenshots.
- [x] Update README to describe the resulting layout.
- [x] Run `npm run check`, inspect the diff, and report results and browser limitations.

## Verification and review

- Playwright: all six setup steps and recording at 18 sizes, 320×400 through 1440×900, in light theme with animation and dark theme with reduced motion. Primary/Back visibility and overlap, scroll reachability, step spacing, canvas expansion, toggle coordinates throughout start animation, and restored toggle position pass.
- Actual microphone UI: Chromium synthetic microphone and mobile rotation keep the action visible.
- Review corrections: icon-only accessible Back on tiny landscape; adaptive portrait chart minimum to keep Stop stationary at 400px viewport height; compact Record navigation slot to prevent crowded indicators.
- WebKit/Safari remains unverified because the installed WebKit executable lacks a required system library.
- Browser scripts and measurements are in `/tmp/diapason-browser/` and `/tmp/diapason-layout-review/`; no browser dependencies were added to the project.

## Pixel portrait follow-up

The supplied Pixel 9 screenshot exposed uneven step widths, mid-word label wrapping, and summaries occupying different rows. Portrait now uses six equal-width steps, compact labels, and aligned single-line summaries; long microphone names truncate visually while retaining full summary tooltips. Desktop keeps the uncapped 50–50 split. The full accessible step names remain unchanged.

Verified with the supplied screenshot's 412×915 CSS viewport plus the existing 20-size matrix, including long microphone names, light/dark themes, reduced motion, and stationary Record/Stop. `npm run check` passes (307 tests). Changes include `src/components/CaptureSteps.tsx` and `src/capture-presentation.ts`.

## Live canvas follow-up

- Portrait recording now uses the same green bordered badge as the landscape Record step.
- Live pitch labels use the editor’s inset gutter, right alignment, and 12px font. Live keeps octave labels so short charts do not crowd every semitone.
- The metronome stays at the top in both orientations, with compact pips for narrow live canvases.
- Input level floats inside the canvas using the editor zoom-widget border, radius, and shadow. Clipping is shown inside this widget so long meters cannot cover its warning.
- The portrait chart reserves enough height for these overlays. Grid flex factors are scaled proportionally during collapse to avoid unused space when the chart is minimum-clamped, keeping Stop stationary throughout animation.

Validation: renderer/component regressions failed before changes and pass afterward; 21-size Playwright matrix passes in light/dark themes with reduced-motion coverage; sharp-note, clipping, and 4/6/12-beat count-in cases pass at six small sizes. Actual synthetic-microphone rendering confirms right-aligned 12px note labels and working rotation. `npm run check` passes with 308 tests.
