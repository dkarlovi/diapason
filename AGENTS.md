# Repository Guidelines

## Project Structure & Module Organization

diapason is a fully client-side whistle-to-MIDI studio built with React, TypeScript, and Vite. `src/main.tsx` mounts the app; `src/router.ts` defines route helpers. Screens live in `src/components/`, generic design-system parts in `src/UI/`, browser effects in `src/hooks/`, the recording inspection logic behind `bin/diapason` in `src/Inspection/`, and pure screen calculations in `src/capture-model.ts` and `src/editor-model.ts`. Audio processing, MIDI/WAV encoding, and IndexedDB storage are separate modules under `src/`. Tests sit beside their source files; shared fixtures live in `tests/fixtures/` and test helpers in `tests/support/`. Shared styles live in `src/styles.css`; `index.html` is the HTML entry point. Plans live in `plans/` and `docs/superpowers/plans/`. Generated output goes to `dist/` and `coverage/`.

The tree is migrating to the layout enforced by `.ls-lint.yml` (naming) and `.dependency-cruiser.mjs` (layering): PascalCase domain folders under `src/`, PascalCase filenames, `use*` hooks, and singular lowercase role suffixes such as `Capture.model.ts` or `Recording.type.ts`. React belongs only in `src/App`, `src/Features/<Feature>`, and `src/UI`; `tools/` is a thin CLI view over `src/Inspection`; shared test fixtures and support live in `tests/`. Put new files where these configs expect them. `npm run arch` has no baseline: fix a new violation rather than suppressing it. Shapes that cross module boundaries, and anything persisted, get explicit types in `*.type.ts` files rather than `ReturnType<typeof …>` of runtime code.

## Quality Enforcement Hierarchy

**This rule applies to every suggestion, refactor, or new pattern you introduce — always.**

> **Executable tool > Agent skill > Written guideline > Nothing**

When proposing or implementing any rule, convention, or best practice, assign it to the highest tier you can reach:

1. **Executable** (preferred): an oxlint rule, dependency-cruiser rule, ls-lint rule, tsc flag, Fallow gate, or CI script that exits non-zero on violation. This is the only tier that is always reliable.
2. **Agent**: a skill or script that an agent runs and interprets. Use when static analysis cannot capture the pattern without too many false positives.
3. **Guideline**: a documented convention with no automated enforcer. Last resort only.

Before suggesting "the agent should check X" or "by convention we do Y", ask: _can a linter, type-checker, or script check this instead?_ If yes, propose that instead, and add it to the relevant config file, not just to documentation.

Active quality rules live in:

- `tsconfig.json`: strict compiler options.
- `npm run lint`: oxlint with its default rules (no config file yet; add `.oxlintrc.json` when a rule needs configuring).
- `.dependency-cruiser.mjs`: layering and import cycles, with no baseline.
- `.ls-lint.yml`: folder and filename rules.
- `.fallowrc.json` + `.fallow-*-baseline.json`: dead code, duplication, and health gates with ratcheting baselines.
- `npm run check` and `.github/workflows/pages.yml`: every gate that blocks merge.

**Tool output rule: actionable or silent.** Every gate in `npm run check` must fail on regression and should print nothing a reader must act on when the tree is clean. Do not add warn-level rules with a standing backlog; a warning nobody must act on hides the findings that matter. If a rule cannot be clean today, close the gate at the current state, record the backlog in a baseline file, and ratchet it down. Advisory reports belong in separate scripts such as `npm run metrics`, not in blocking gates.

**Tool config rule: the config file, not the command line.** A gate must behave identically whether CI runs it or someone runs the tool by hand. Every setting a tool's own config file can express belongs there, never in the npm script. Use a CLI flag only for what the config format cannot express, and leave a comment in the config naming the flag and why, so a later tool upgrade can retire it.

## Build, Test, and Development Commands

Use Node 22+ and install locked dependencies with `npm ci`.

- `npm run dev`: start Vite at `http://localhost:5173/diapason/`.
- `npm run build`: typecheck, build `dist/`, and create the Pages fallback.
- `npm run preview`: serve the production build locally.
- `npm test`: run Vitest in jsdom.
- `npm run test:coverage`: collect V8 coverage reports.
- `npm run format`: apply oxfmt formatting.
- `npm run check`: run typechecking, oxlint, dependency-cruiser (`npm run arch`), formatting checks, Fallow checks, coverage tests, and the production build.

Fallow checks require `origin/main` and `HEAD^`. Avoid growing the committed duplication and health baselines.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, and semicolons; let oxfmt enforce formatting. Use PascalCase component filenames (`Capture.tsx`), `use`-prefixed hooks (`useCapture.ts`), and descriptive lowercase or kebab-case module names (`editor-model.ts`). Prefer explicit type-only imports. Keep browser effects in hooks and reusable calculations in pure modules.

## Presets and Controls Invariant

Presets only provide values for explicit user-facing controls. All detection and musical interpretation behavior must depend on the effective control values, never on the preset's identity. Do not introduce branches such as `if (preset === "auto-tune")` to enable a different algorithm or hidden scoring behavior.

If new behavior needs another parameter or mode, expose it as a slider, toggle, selector, or other appropriate control; the preset supplies its value. Given the same input, interpretation version, and effective control values, results must be identical regardless of which preset supplied those values. Preserve this invariant in previews, saved recordings, diagnostics, sharing, and MIDI export.

## Testing Guidelines

Use Vitest and React Testing Library. Name tests `*.test.ts` or `*.test.tsx`; use `*.integration.test.tsx` for integration scenarios. Cover observable behavior and regressions, mocking browser audio or MIDI APIs where needed. Run a focused test with `npm test -- src/take.test.ts`. Coverage includes all production TypeScript; no percentage threshold is currently enforced.

## Commit & Pull Request Guidelines

Review and update `README.md` on every feature branch so it reflects the resulting app behavior, available features, setup instructions, and known limitations. Remove or revise roadmap ideas as they are implemented.

History uses short descriptive subjects such as `React UI` and `Fallow health`; no mandatory prefix convention is evident. Keep commits focused. Describe the problem, resulting behavior, and validation in pull requests; link relevant issues and include screenshots for visible changes. Run `npm run check` before submission. GitHub Actions checks pull requests targeting `main`; pushes to `main` deploy to GitHub Pages.

Screenshots belong in the relevant GitHub pull request or issue as GitHub user attachments, embedded in its body or comments. Do not add or commit screenshots to the repository to satisfy this requirement. Keep captures in a temporary location and upload them directly, for example with `gh pr create --attach`, `gh pr edit --attach`, or the corresponding issue commands.

## Browser Configuration

Microphone access requires localhost or HTTPS. Preserve the `/diapason/` base path and remember recordings persist locally in IndexedDB.
