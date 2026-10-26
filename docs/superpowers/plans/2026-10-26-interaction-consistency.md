# Interaction consistency implementation plan

**Goal:** Resolve all five interaction critique findings while preserving the
Download-first hierarchy, original audio, and recording behavior.

**Decisions:** Use amber for running playback/audition controls and blue for
applied selections. Keep recording Stop red. Hide mobile Tune/popovers when
starting auditions and focus the roll; reopening Tune returns to the last menu.
Applied preset means the exact recipe without custom overrides. Audition status
names the candidate and truthfully distinguishes Applied from Not applied.
Replace hidden label resets with explicit scoped Reset controls. Offer one-step
Undo tuning change for melody/playback-setting changes without reverting note
edits, names, or other recording data. Preserve the existing full-reset confirmation.

**Architecture:** Keep audio scheduling in the existing playback hook. Store
candidate metadata alongside the editor's preview state; the renderer continues
to use the exact auditioned notes. Keep tuning-only undo snapshots at the editor
record replacement boundary so existing persistence and unrelated edits remain
intact. Share playback classes and semantic colors across Library, Editor,
dropdowns, and tempo controls.

- [x] Add failing behavior regressions for candidate identity/applied state,
      custom preset, mobile focus/visibility, explicit resets, and tuning undo.
- [x] Implement editor candidate metadata, truthful state comparisons, and
      one-step tuning undo; preserve unrelated data and clear history per take.
- [x] Update shared controls, responsive audition behavior, and explicit reset
      affordances, including returning to the last menu when Tune is reopened.
- [x] Consolidate running-state styles, verify contrast, and update docs/catalog.
- [x] Run focused/full tests, production build and source checks; inspect
      desktop/phone, light/dark playing, previewing, applying, resetting, and undo.
- [x] Obtain independent code review and resolve findings before completion.

## Validation

All 350 tests across 60 files pass. The production build, typechecking, source
lint, source/document formatting, and whitespace checks pass. Chromium verified
1280px, 390px, and 320px in light and dark themes: Library/editor/dropdown amber
states, truthful preview/applied status, mobile focus and menu restoration,
scoped reset and undo persistence, and no control overflow. Synthetic microphone
checks verified amber metronome/clap controls and red recording Stop on desktop.

Rendered text contrast is approximately 4.68:1 for blue applied controls and
5.91:1 for amber playback in light mode; dark equivalents exceed 7.9:1.
Real hardware, physical touch devices, and screen readers were not tested.

Independent review caught a selected default grid being reported as Not applied;
a failing regression was added, then fixed by comparing effective knob values
for individual setting auditions while keeping exact recipe checks for presets.
The reviewer confirmed the scoped correction.

`npm run check` reaches formatting and remains blocked by 40 pre-existing
Impeccable distribution files. These files and committed baselines were not
changed. The two critique archives created in this session were formatted.
