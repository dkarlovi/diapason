# Editor overlay implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** Ship the approved shared-timeline overlay prototype in the real editor.
**Architecture:** Keep the recording, interpretation, playback, and export engines. Add a pure viewport model and rendering hook; connect real preset/key audition results to the roll. React components provide the overlay, contextual note controls, and header actions.
**Tech stack:** React, TypeScript, Canvas, existing Web Audio/Web MIDI and Vitest.
**Spec:** `prototypes/editor-directions.md` and the approved shared-timeline overlay in `prototypes/editor-directions.html`.

## Constraints

- Overlay only; starts at 360px, resizes from 286px to 50% on desktop.
- Shared time axis; original track hides completely and starts hidden on mobile.
- Identical Play/Download pairs; move them left of open Tune on desktop.
- Preserve all real presets, key choices, advanced controls, note muting, context playback, exports, diagnostics, rename, duplicate, delete, and external MIDI routing.
- Preset/key previews never save and must show the auditioned notes. Regular Stop ends any MIDI audition. Restore applied notes after stopping.
- Canvas fills the workspace, with floating zoom/navigation and pitch fit.
- Keep `/diapason/`, themes, reduced motion, keyboard access, and local persistence.
- No new dependencies or expanded duplication/health baselines.

## Review focus

- Long and empty recordings: finite view bounds, fitted pitch, shared pan, and follow into the final viewport.
- Preview replacement/output changes/navigation: obsolete audio stops and displayed audition clears.
- Resizing/mobile: playback controls remain reachable with the original visible or hidden.
- Muted and preview notes: hit testing uses displayed geometry and raw anchors; exports always use applied settings.
- Keyboard: dropdown dismissal restores focus, notes remain accessible without the Notes panel, divider supports arrows/Home/End.

## Task 1: Shared viewport and audition state

Files: `src/editor-viewport.ts`, `src/editor-viewport.test.ts`, `src/hooks/useEditor.ts`, `src/hooks/useEditorPlayback.ts`, `src/hooks/useEditorPlayback.test.tsx`, `src/hooks/useEditorPlot.ts`, `src/trace.ts`, `src/trace.test.ts`.

- [x] Add failing tests for viewport clamping/following, fitted pitch, preview roll equality with scheduled notes, regular Stop, and sounding-note rendering.
- [x] Run focused tests and confirm failures.
- [x] Implement viewport calculations and rendering hook; preserve preview interpretation/items without saving; expose Stop and displayed view to components.
- [x] Run focused tests to green.

## Task 2: Overlay UI and controls

Files: `src/components/Editor.tsx`, `EditorCanvas.tsx`, `EditorTools.tsx`, `MelodyPanel.tsx`, new focused editor controls, `src/hooks/useEditorLayout.ts`, `src/editor.css`, `src/components/AppShell.tsx`.

- [x] Add/update tests for preset disclosure, tuning categories, header actions, source collapse, keyboard resizing, and note access.
- [x] Run tests to confirm failures before replacing the old layout.
- [x] Implement the approved overlay, matching controls, grouped tuning, real previews and contextual note tools. Preserve key alternatives and all advanced controls.
- [x] Match the prototype visually in Chrome at desktop, short desktop, and mobile sizes in both themes.

## Task 3: Final verification and documentation

- [x] Update README and studio design principles to describe actual shipped behavior.
- [x] Run final `npm run check`; resolve regressions without growing baselines.
- [x] Independently review the full change; address important findings and repeat affected checks.
- [x] Leave changes reviewable on the feature branch; do not merge, publish, or deploy.
