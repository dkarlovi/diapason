# Canvas design system implementation plan

**Goal:** Document the existing studio design and share the canvas surface used
by live recording, original audio, and the MIDI roll without changing behavior.

**Architecture:** Keep the existing `drawTrace` renderer and semantic theme tokens.
Add `PitchCanvas` as a native canvas primitive with a required accessible label,
React 19 ref support, and native event/attribute forwarding. Consolidate its
edge-to-edge styles in `studio.css`; retain editor-only touch handling in
`editor.css`. Leave rendering schedules, layout containers, and controls intact.

**Approaches:** A combined live/editor controller would couple different update
lifecycles. Documentation alone would leave repeated surface markup and CSS.
The selected scope is a shared canvas primitive with existing screen controllers.

**Constraints:** Preserve `/diapason/`, original audio, keyboard interaction,
responsive layouts, light/dark themes, and all existing controls. Add no runtime
dependencies. Carry forward the agreed Slate & blue direction from
`docs/design-principles.md`.

- [x] Capture desktop/mobile, light/dark baselines and run focused tests.
- [x] Test the native ref, accessible fallback, and event forwarding contract.
- [x] Extract `src/components/PitchCanvas.tsx`, migrate the three canvas uses,
      and consolidate shared CSS.
- [x] Write root `DESIGN.md` and `.impeccable/design.json` from source tokens and
      existing design agreements; document component reuse and update README.
- [x] Compare canvas geometry, computed styles, and pixels against baselines;
      verify keyboard selection and focus. Run `npm run check` and review diff.

## Validation

All 343 tests across 60 files passed with coverage. Production build, typechecking,
source lint, changed-file formatting, YAML/token/catalog validation, and diff
whitespace checks passed. All eight preview snippets rendered in shadow DOM.
Canvas pixels, geometry, and computed styles matched the pre-extraction baseline
for recording and editing at desktop/mobile sizes in light/dark themes.

`npm run check` stops on formatting in 40 pre-existing Impeccable distribution
files. Separate duplication and audit runs also flag the pre-existing skill
scripts (duplicate code and five unreachable files). These vendor files and the
committed baselines were left untouched. The audit was rerun outside the sandbox
to permit its temporary worktree. A fresh review found no canvas regressions;
missing preview alias fallbacks were added and verified in the browser.
