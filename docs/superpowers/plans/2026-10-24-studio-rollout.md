# Editor and Library design rollout

> **For agentic workers:** Use superpowers:executing-plans inline. The user has authorized applying the established design to the remaining screens.

**Goal:** Extend the approved Slate & blue system to the complete studio.

**Spec:** `docs/design-principles.md` and the approved workstation prototype.

**Architecture:** Reuse the existing theme and controls. Give all routes a shared
compact shell. Keep Editor audio and MIDI canvases above separate scrolling
toolboxes. Preserve the existing editor, playback, storage, and export hooks.

**Tech stack:** React, TypeScript, Tailwind, Lucide, Vitest.

## Constraints and review focus

- The audio and MIDI panels stay paired, with matching play/download positions.
- Use the same system themes, type scale, and inline fields as Recording.
- Keep all presets, key previews, knob controls, note muting, and exports.
- Do not add zoom functionality in this styling pass.
- Redraw saved canvases on theme changes and container resizing.
- Keep Library empty states, preview toggles, duplication, deletion, and routing.
- Preserve readable settings on small/short screens and keyboard access to menus.
- Do not alter the existing Recording flow or grow Fallow baselines.

## Tasks

- [x] Add failing Editor tests for paired accessible canvases and one shared title;
      update Library's duplicate test to exercise the actions menu.
- [x] Generalize the shell/theme and keep loaded recording names in the header.
- [x] Separate Editor canvas panels from their toolboxes; retain behavior and
      compact the melody controls using the existing preview/apply actions.
- [x] Restyle Library rows and empty state, with secondary actions in a menu.
- [x] Add saved-canvas redraw support for system theme/container changes.
- [x] Update README and verify focused tests, browser screens in both themes,
      fresh code review, and `npm run check`.

## Validation

`npm run check` passed: 50 test files, 251 tests, coverage, typechecking, lint,
formatting, duplication, health baseline checks, and production build. No
baselines grew. Fresh review has no remaining Important findings. Browser checks
covered both themes, paired canvas geometry, independent tool scrolling, menu
duplication, deep mobile scrolling, short desktop/mobile windows, and Recording
screen regression. The existing localhost:5173 server serves the updated shell.
