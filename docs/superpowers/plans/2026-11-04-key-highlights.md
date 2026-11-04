# Key highlights implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Implement issues #76 and #77 together: shade out-of-key rows and mark out-of-key notes.

**Architecture:** Share the displayed interpretation's scale with the canvas renderer. Row shading belongs to the cached background; warning badges belong to active and muted note bars. Preserve logical note classification during octave animation.

**Tech Stack:** React, TypeScript, Canvas 2D, Vitest, Chrome.

**Spec:** GitHub issues #76 and #77; DESIGN.md pitch canvas and stable geometry rules.

## Global constraints

- Use `scalePitchClasses` and the displayed interpretation's effective key, including auditions.
- No decoder, preset recipe, persistence, or interpretation-version changes; #75 remains separate.
- Preserve the existing theme and edited/muted/origin styles. Use shape as well as tone.
- No key means no shading or markers. Capture and original audio stay unshaded.
- Screenshots stay in `/tmp`; review README.md and run `npm run check`.

## Review focus

- Null key, minor raised seventh, negative pitch-class normalization, and partial edge rows.
- Cache invalidation after changing scale and stable reuse with equivalent scales.
- Preview versus applied interpretation, Mode changes, edits, and drag updates.
- Fractional octave animation must not change a note's classification.
- Muted/edited/sounding combinations, tiny notes, and forced colors.

## Task 1: Canvas rendering and classification

**Files:** `src/Audio/Trace.ts`, `src/Audio/Trace.type.ts`, `src/Audio/Trace.test.ts`, `src/Theme/Theme.css`, imports of public trace types.

**Interfaces:** `TraceView.scale?: ReadonlySet<number>` and `notePitchOffset?: number` provide scale membership and the rendered-to-logical note offset. Public trace shapes live in `Trace.type.ts` per repository guidance.

- [x] Add failing renderer tests for major/minor/no scale, partial rows, active and muted marks, cache invalidation, and logical pitch offsets.
- [x] Run the focused test and confirm missing behavior failures.
- [x] Shade rows before grid lines; draw a warning-colored circled exclamation at each out-of-key bar's trailing edge, over its own plate. Include scale values in the background cache key. Add a theme token; suppress shading in forced colors.
- [x] Run the focused renderer tests.

## Task 2: Editor integration and review

**Files:** `src/Features/Editor/useEditor.ts`, `useEditorPlot.ts`, `useEditorPlot.test.tsx`, `EditorLoaded.test.tsx`, `NoteDetail.tsx`, `README.md`, `DESIGN.md`, `.impeccable/design.json`.

**Interfaces:** Editor passes `displayed.interpretation.key.chosen` to the plot. Plot resolves the scale and passes it only to the MIDI roll, with the animated note offset. Note inspector exposes key membership as accessible text without introducing an in-flow status row.

- [x] Add failing tests for roll-only highlighting, key changes, fractional animation, and preview effective key.
- [x] Wire the displayed key, scale, and note offset; explain the markers through the inspector and documentation.
- [x] Verify in Chrome at desktop, phone portrait/landscape, light/dark/forced colors, and default/minimum Tune widths. Capture edited/muted/origin combinations.
- [ ] Run `npm run check`, address regressions without growing baselines, and review the diff.

## Review evidence

- Renderer regression tests: major/minor/no key, partial rows, normalized negative pitches, edited/muted/sounding notes, fractional pitch offsets, scale cache updates, short labels, proportional left overhang, disabled axis labels, and reduced-motion playback.
- Editor tests: scale changes affect the roll only; previews expose their effective key and Stop restores the applied key.
- Chrome captures at 1440 × 900, 390 × 844, and 844 × 390 in light, dark, and forced colors: no horizontal overflow; warning badges remain distinct on active, edited, muted, and edited/muted bars. Captures are temporary files under `/tmp/key-*.png`.
- Tune reviewed at 360px and 286px in Essentials and Pitch. Shared row bounds are x=1097/1171 and width=327/253 respectively; labels, widget starts, values, and Reset slots remain aligned.
- Note inspector measured 256 × 87px for in-key, out-of-key, and muted states; controls retain their slots while pitch membership changes.
- Final independent code review: no actionable findings against the user's proportional warning/left-overhang/disabled-axis-label requirements.

## Warning feedback refinement

Use a filled warning-colored circle with an exclamation mark and a contrasting
surface ring. Keep it legible over stripes, mute outlines, and sounding fill. On
note onset, tilt only the badge by up to about 11 degrees with a decaying wobble
for 400ms. Reuse playback ticks; no additional animation loop or layout work.
Reduced motion keeps a static badge. Notes, labels, row shading, and controls stay
still. The moment connects the audible out-of-key note to its visual warning.

The user requested height-proportional badges (80% of bar height), intentional
left overhang when a note is too short, and shaded/dimmed out-of-key axis labels.
Warnings render above the other canvas layers so overhangs remain visible.

- Live playback inspection: warning glyphs wobble by at most 0.178 radians during
  their onset; reduced-motion playback recorded no nonzero rotations.
- Two subprocess integration tests timed out under the first concurrent coverage
  run; both files passed separately (10 tests, 49.17 seconds) outside the sandbox.
