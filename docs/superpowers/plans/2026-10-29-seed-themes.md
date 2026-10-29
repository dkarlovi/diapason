# Seed Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Generate coordinated light/dark studio themes from seed colors, preserve them in embed navigation, and demonstrate them in the development playground.

**Architecture:** Parse a small URL configuration into normalized seed definitions. Generate semantic hex tokens with Material Color Utilities before applying them at the document root; canvas rendering consumes the same tokens and invalidates cached palettes on theme changes. Keep presentation state out of musical state and shared tune payloads.

**Tech Stack:** React 19, TypeScript, Vite, Material Color Utilities 0.3, Vitest/Testing Library, browser validation with Playwright if available.

**Spec:** [Seed theme design](../specs/2026-10-29-seed-themes-design.md)

## Global Constraints

- Fully client-side; preserve `/diapason/`, existing embed restrictions, musical behavior, and workstation layout.
- One to three opaque hex seeds per supplied mode, at most six overall; a single supplied mode generates both schemes.
- Packed themes are limited to 27 canonical base64url characters; invalid versions, masks, lengths, and noncanonical encodings fall back as a whole.
- `scheme=auto|light|dark`; invalid values become auto. No preferences UI, persistence, or parent messaging.
- Apply palettes before paint and share them with portals, native controls, and charts. No generation or repeated DOM probes in animation/audio hot paths.
- Use Impeccable's existing Operate direction, craft floor, rendered review, audit, and polish. The user's instruction to plan and proceed authorizes execution without another plan approval gate.
- Keep changes reviewable on `feature/seed-themes`; do not merge, publish, or push.

## Review Focus

- Near-black, near-white, gray, yellow, and conflicting multi-seed inputs must produce readable colors, not invalid or unbounded output (Task 1 tests).
- Explicit modes must follow the configured scheme rather than the system preference, including portaled menus and cached charts (Tasks 2–3 tests/browser checks).
- Theme entry parameters must survive query-less navigation, tune Save, refresh, and invalid input without losing tune fragments (Task 2 regressions).
- Theme changes must neither leak root styles after unmount nor add work to playback ticks (Task 3 regression and browser checks).
- Playground-generated URLs must work cross-origin, preserve tune fragments, and clearly signal that reloading ends current work (Task 4 browser validation).

## Files and responsibilities

- `src/theme-config.ts` and tests: public types, safe parsing, canonical query serialization.
- `src/theme-palette.ts` and tests: pure seed-to-semantic-token generation; shared contrast guarantees.
- `src/hooks/useStudioTheme.ts` and tests: root application, lifecycle cleanup, theme change event.
- `src/hooks/useStudioMode.tsx`: retain normalized theme/scheme alongside current entry configuration.
- `src/components/AppShell.tsx`: apply the active theme through the hook.
- `src/theme.css`, related CSS: semantic defaults, native/forced-color styles, trace mappings.
- `src/trace.ts`, `src/hooks/useEditorPlot.ts` and tests: effective palette cache key and redraw invalidation.
- `dev/embed.html`: presets, per-mode seeds, scheme selector, host appearance, iframe snippet.
- README/design documents: user API, semantic mappings, validation evidence and limitations.

### Task 1: Configuration and palette generation

**Interfaces:** `ThemeSeeds`, `StudioTheme`, `ColorScheme`; `parseTheme(value: string | null): StudioTheme | undefined`; `parseColorScheme(value: string | null): ColorScheme`; `generateTheme(theme?: StudioTheme): { light: ThemeTokens; dark: ThemeTokens }`, where `ThemeTokens` is a named semantic-role-to-hex record.

- [x] Write `theme-config.test.ts` covering canonical short hex expansion, optional-mode fallback, invalid types/colors/missing primary, packed slots, canonical encoding, and the length bound; run and observe missing implementation failures.
- [x] Implement parsing and normalized configuration types; verify the focused tests pass.
- [x] Write `theme-palette.test.ts` with real engine generation across hue/extreme fixtures and custom neutral/secondary inputs. Assert hex output, independent modes, and WCAG contrast on actual surface/text/fill pairs, not exact aesthetic constants. Run before implementation.
- [x] Use the package's exported `DynamicScheme` constructor with `Variant.TONAL_SPOT`, the 0.3 implementation of the 2021 scheme, `contrastLevel: 0`, and custom tonal palettes supplied before role resolution. This pins documented behavior instead of depending on changing defaults. Cap neutral chroma at 6/8 and secondary chroma at 32; preserve their hue. Use the resolved tertiary role for playback.
- [x] Map scheme surfaces and foregrounds to existing roles; use distinct `border` and `input-border` roles so decorative grids stay quiet while control boundaries remain visible. Use fixed HCT warning/success families resolved against studio surfaces. Tighten contrast against every relevant mapped surface if dynamic roles alone are insufficient.
- [x] Run the focused tests and production build; record bundle impact. Named root exports are necessary because the dependency exports only its root; rely on Vite tree shaking.

### Task 2: Entry configuration and theme application

**Interfaces:** `useStudioMode()` additionally exposes `theme: StudioTheme | undefined` and `scheme: ColorScheme`; `useStudioTheme(theme, scheme): void` owns document application and emits `studio-theme-change` after updates.

- [x] Extend embed integration tests for normalized theme/scheme retention through query-less navigation, invalid configuration fallback, and locked tune route redirects. Add a promoted-tune regression in the existing tune integration suite. Observe failures first.
- [x] Extend configuration parsing/serialization in `useStudioMode.tsx`, keeping unknown query parameters and tune fragments while restoring normalized entry theme/scheme.
- [x] Add hook tests for root colors, forced/auto scheme, reconfiguration, event dispatch, and restoration on unmount; observe failures before implementing the hook.
- [x] Apply generated paired tokens in a layout effect on the document root, restoring previous owned styles on cleanup. Use root `color-scheme` and root theme identity so portals inherit correctly. Keep configuration generation memoized independently of frequent app renders.
- [x] Call the hook from `AppShell`; migrate CSS tokens to generated values with static built-in fallbacks and native-control/selection/forced-color handling. Remove the shell-level forced auto scheme and success override. Keep background surfaces consistent across the whole document.
- [x] Run configuration, hook, and embed/tune integration tests; typecheck.

### Task 3: Canvas palette correctness

**Interfaces:** canvas consumers listen for `studio-theme-change`; trace cache keys include root theme identity and computed effective scheme.

- [x] Add a saved-chart regression asserting a theme event redraws with invalidated palette without restarting playback or requiring a React render. Run and observe failure.
- [x] Add the theme-change subscription/cleanup to `usePlotRedraw`; retain normal resize/system subscriptions for standalone renderer compatibility.
- [x] Include effective root identity/scheme in `traceColors`' cache key; use the shared playback role for playhead/original audio and primary for MIDI. Validate live tracing uses its existing loop and no extra per-frame work.
- [x] Run focused plot/trace tests and inspect DOM/canvas colors in a real browser for forced schemes and theme replacement.

### Task 4: Interactive playground and visual refinement

**Interfaces:** the playground uses the documented packed URL API; no parent messaging protocol.

- [x] Add theme presets (default blue, forest, terracotta, plum, difficult yellow), forced/auto scheme controls, primary/optional neutral/optional secondary inputs for each mode, and a checkbox to derive dark from light.
- [x] Generate encoded query parameters with `URLSearchParams`; preserve editor tune fragments and microphone/cross-origin options. Reflect host light/dark appearance around the frame; retain resizing and recording/editor switching.
- [x] Keep the no-custom-theme option available. Explain seed adjustment and reload behavior next to the controls; show the exact iframe snippet after each explicit reload.
- [x] Run the app and inspect desktop and narrow editor embeds, capture, a saved/empty Library, menus, and forced scheme opposite to the system. Check difficult seeds, color-vision simulations, computed contrast, console errors, and chart redraws.
- [x] Perform scoped Impeccable audit/critique/polish on the actual render; fix token-level defects. Save reproducible representative screenshots and record unavailable browser coverage.

### Task 5: Documentation and final checks

- [x] Update README setup/features/embed examples and known limitations; document the packed contract, mode fallback, and seed adjustment.
- [x] Update `DESIGN.md`, `.impeccable/design.json`, and `docs/design-principles.md` for the generated defaults and semantic roles. Keep product context and unrelated configuration changes out of scope.
- [x] Run `npm run check`. Resolve failures without growing duplication/health baselines; record any pre-existing external requirement failure accurately.
- [x] Request a fresh whole-change code review against this plan/spec, address important findings, and rerun affected verification.
- [x] Mark plan tasks complete with evidence; leave the working branch reviewable and report the playground URL and validation results.

## Execution record

- Baseline: 103 test files / 616 tests pass. Existing jsdom document-navigation notice remains present.
- Baseline production app: JS 623.17 kB / gzip 203.20 kB; CSS 68.30 kB / gzip 13.47 kB. Existing large-chunk warning.
- Working branch: `feature/seed-themes`. Branch creation required sandbox escalation; implementation remains in the shared checkout to retain the drafted spec and give the user immediate playground access.
- Material Color Utilities 0.3.0 pinned after reproducing an invalid extensionless ESM import in 0.4.0. Construct `DynamicScheme` from `SchemeTonalSpot` palettes with overrides before role resolution; no custom fork needed.

## Verification results

- Full `npm run check` passes, including 106 test files / 655 tests, coverage,
  duplication checks, Fallow health gate, typechecking, formatting, lint, and build.
  The audit required elevated Git metadata access for its temporary worktree;
  committed health/duplication baselines were not changed. Existing advisory
  complexity/style warnings and the existing Vite large-chunk warning remain.
- Final production app JS: 665.62 kB / gzip 217.01 kB, an increase of 42.45 kB /
  gzip 13.81 kB. CSS: 70.08 kB / gzip 13.64 kB. No image-extraction code is used.
- Chromium 151 checked all five presets in light/dark, cross-origin iframe URLs,
  portaled menu schemes, forced mode stability, automatic OS changes, runtime
  canvas palette replacement, independent per-mode seeds, 360px Tune, capture,
  Library, and forced-color system roles. Twelve rendered extreme-seed cases
  measured minimum ratios of 6.42:1 button text, 13.23:1 input text, and 5.25:1
  input boundaries. Three color-vision simulations were captured for review.
- Representative screenshots and reproduction data are in
  `docs/screenshots/seed-themes.json`. The available WebKit executable cannot
  launch because `libicudata.so.66` is missing; Firefox is not installed in the
  Playwright browser cache. These browsers remain unverified.
- Fresh code review found no must-fix correctness/performance issues. Its one
  playground accessibility finding (four unnamed optional color fields) was
  corrected and checked using the real browser's accessible-name selectors.
- Work remains uncommitted on `feature/seed-themes` for inspection. No merge,
  push, publication, or preferences dialog was added.

## Follow-up: packed colors instead of JSON

- [x] Replace the theme wire format with version byte 1, a six-slot presence mask,
      and RGB triples for present seeds, encoded as unpadded base64url (7–27 chars).
      Keep the internal typed seed model and independent scheme selector.
- [x] Extract the existing canonical base64url primitive into `src/base64url.ts`
      for shared use by tune and theme codecs, retaining tune payload limits.
- [x] Add literal binary fixtures, short-hex normalization, all 24 optional-slot
      combinations, malformed masks/version/length/trailing-bit rejection, and invalid
      encoder-input tests. Update navigation and tune-Save regressions to packed values.
- [x] Use `encodeTheme` in both navigation and the development playground. Update
      the public documentation and spec, superseding the initial JSON URL proposal.
- [x] Verify the real playground's generated snippets, refresh and theme rendering;
      refresh screenshot reproduction data and run `npm run check`.

Packed-format verification: full `npm run check` passes with 106 test files / 667
tests and unchanged health/duplication baselines. Chromium verified all five
preset pairs and refreshed screenshot snippets/reproduction URLs. Focused codec
review found no must-fix issues. Production JS is 666.29 kB / gzip 217.31 kB.
