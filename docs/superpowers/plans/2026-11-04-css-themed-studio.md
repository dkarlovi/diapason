# CSS themed studio implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Let hosts embed and theme the studio with HTML and CSS alone.

**Architecture:** A native `<diapason-studio>` element served by `diapason.js` owns an iframe. It reads inherited CSS colors and color scheme, seeds the first URL, and sends subsequent theme updates through a validated parent message channel. Existing iframe URLs remain supported.

**Tech Stack:** TypeScript, Custom Elements, Vite, React, Vitest.

**Spec:** https://github.com/dkarlovi/diapason/issues/79; the user selected `<diapason-studio>` and `diapason.js`.

## Global constraints

- Preserve `/diapason/`, packed theme URLs, and existing editor and recording workflows.
- No dependencies or host JavaScript beyond the module script.
- Shared message shapes belong in a `*.type.ts` file.
- Preserve pre-existing package.json and .codex changes.
- Do not change the adjacent consumer repository.

## Review focus

- Host CSS can change through ancestors, stylesheets, media queries, or replacement tokens.
- Theme messages must never navigate the iframe or reset active work.
- Only the embedding parent can provide messages; malformed payloads leave the current theme intact.
- Deferred loading, disconnection, reconnection, and multiple elements must remain independent.
- CSS colors can use modern spaces and inherited color-scheme; missing seeds use defaults.

### Task 1: Live theme channel

**Files:** Create `src/Theme/ThemeMessage.type.ts`, `src/Theme/ThemeMessage.ts`, and adjacent tests. Modify `src/App/useStudioTheme.ts` and its tests.

**Interfaces:** Parent sends `{ type: "diapason:theme", theme: string | null, scheme: "light" | "dark" | "auto" }`; iframe announces `{ type: "diapason:ready" }`. Packed theme keeps the existing validator authoritative.

- [x] Write tests for valid messages, explicit default reset, invalid inputs, parent/source validation, and standalone isolation; watch them fail.
- [x] Implement validation and the embedded-only listener without navigation. Announce readiness after installing the listener.
- [x] Run focused tests and retain existing theme restoration checks.

### Task 2: Native element and standalone loader

**Files:** Create `src/Studio/Diapason.ts` and adjacent tests; create CSS theme reader with tests in `src/Theme/`; modify `vite.config.ts`.

**Interfaces:** `<diapason-studio tune="…" after-recording="edit" title="…" loading="lazy">`; inherited `--diapason-primary`, `--diapason-neutral`, `--diapason-secondary`, and `color-scheme`. Loader resolves the app origin/base from its own module URL.

- [x] Write failing tests for URL construction, permissions, sizing, deferred loading, live changes, reconnection, and message filtering.
- [x] Implement the element with an isolated iframe, landscape default dimensions, and title/loading forwarding. Poll computed styles only while connected and visible; use media-query changes for immediate scheme updates. Attribute updates apply immediately.
- [x] Emit a stable `diapason.js` alongside the application; serve the same entry during development.
- [x] Verify focused tests and production loader output.

### Task 3: Consumer documentation and verification

**Files:** Modify `README.md` and `dev/embed.html` as needed for a CSS-only demonstration.

- [x] Document module script, element attributes, CSS mappings, live updates, sizing, and permissions. Correct direct iframe examples to include MIDI delegation.
- [x] Run `npm run check`; resolve new lint, structure, duplication, and health findings without growing baselines.
- [x] Verify actual browser colors, live iframe identity, permissions, modern CSS colors, cross-origin delivery, and phone/landscape sizing. Keep screenshots in `/tmp`.
- [x] Request an independent review, address material findings, and report verification evidence.

## Verification record

- Focused Vitest cases exercise the theme channel and native element lifecycle.
- Browser script `/tmp/check-diapason-css-element.mjs` verifies Chromium at 1440 × 1000, 390 × 844, 844 × 390, and 320 × 568; host/frame bounds match without page overflow. Captures are in `/tmp/diapason-css-element-*.png`.
- Production module loaded from `localhost:4173` on a `127.0.0.1:5173` host; both delegated features are permitted, live theme changes preserve a document marker, and preference changes update the scheme.
- Independent review identified detached workflow updates and transparent modern-color conversion. Both were reproduced before fixes and verified afterward.
- Full quality gate initially hit domain-test timeouts under unrestricted worker concurrency. `VITEST_MAX_WORKERS=2 npm run check` passed: 142 test files and 893 tests, plus every static gate and the production build. No baselines grew.
- After user feedback, the example's forced-dark hero was removed. Browser verification confirms that both example frames switch seeds and scheme with the host preference in both directions while retaining their documents.
