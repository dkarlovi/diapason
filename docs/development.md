# Development and deployment

[Project overview](../README.md)

Contributor setup, local checks, CI, and hosting. Repository instructions for agents live in [AGENTS.md](../AGENTS.md); source ownership is mapped in [Architecture](architecture.md).

Requires Node 22.18+.

Dependencies use stable npm releases, with exact resolved versions committed in
`package-lock.json`. Node.js type definitions track the latest stable release;
runtime scripts must remain compatible with Node 22.18+ and CI runs on Node 22.

Dependabot checks npm dependencies and GitHub Actions weekly, grouping updates
into one pull request per ecosystem. Its configuration lives in
[`.github/dependabot.yml`](../.github/dependabot.yml).

```bash
npm ci
npm run dev      # opens http://localhost:5173/diapason/
```

Microphone access needs a secure context; `localhost` qualifies, so the plain
Vite dev server works without HTTPS.

## Commands

```bash
npm run build     # typecheck (tsc) + production build to dist/
npm run preview   # serve the production build
npm run typecheck # tsc --noEmit only
npm test          # Vitest regression tests
npm run lint      # oxlint, held to .oxlint-baseline.json
npm run lint:baseline # lower the oxlint baseline after fixing findings
npm run arch      # dependency-cruiser layering and import-cycle rules
npm run lint:names # ls-lint folder and filename rules
npm run structure # thin modules, shared export names, and re-exports
npm run dupes     # Fallow semantic/near-miss duplicate check
npm run audit     # Fallow dead code, complexity, duplication, and styling review
npm run health    # Fallow complexity gate against the health baseline (needs coverage)
npm run metrics   # advisory health scores, hotspots, and refactoring targets
npm run format    # oxfmt
npm run format:check # verify formatting
npm run check     # typecheck + lint + names + arch + structure + format check + Fallow + tests + build
```

## Linting and compiled tests

React linting checks hooks, render purity, refs, immutable state, component identity,
DOM properties, controlled checkboxes, stable prop defaults, and context values.
Existing findings are recorded in `.oxlint-baseline.json`; new findings fail
`npm run lint`, and fixes require lowering the baseline.

React Compiler runs on application components and hooks in development, production
builds, and Vitest. The shared Vite configuration applies the same Babel compiler
options to browser and test transforms. Tests and framework-free audio/MIDI code
are excluded from compilation. `npm test` exercises compiled application code and
includes a pipeline check that verifies compiler output for both environments.
Existing Rules of React violations can cause individual components or hooks to be
skipped; lowering the lint baseline increases the code eligible for optimization.

## Fallow and baselines

The duplication check normalizes renamed variables and changed literals. It allows
zero matches and needs no baseline. Fallow's separate model-backed `similar-code` command can
suggest functions with different structures for manual review, but is not a CI gate.
The development CLI is a support entry in Fallow's graph, keeping its Node-only
libraries in `devDependencies` while browser runtime imports remain checked.
The audit also blocks new dead code and complexity findings in changed files, and
`npm run health` blocks them across the whole project. The health baseline records the
existing hotspots in `useEditor`, `useCapture` and `Pitch` for later
refactoring; CSS findings are advisory while styling work is pending. The health and
oxlint baseline gates also fail when an entry matches no current finding, so a moved file or a fixed
hotspot forces the baseline to be updated instead of silently going stale. The
advisory metrics report stays available as `npm run metrics:coverage`. Fallow audit compares
baseline growth with `origin/main`; audit compares with `HEAD^`, the base of
GitHub's pull request merge commit and the previous `main` commit after merge.
Run checks from a Git checkout with both refs available.

## Coverage

`npm run test:coverage` collects V8 coverage for all production TypeScript, including unexecuted files. Reports are in `coverage/index.html`, `coverage/coverage-summary.json`, and `coverage/coverage-final.json`. `npm run metrics:coverage` regenerates coverage and passes it to Fallow for measured function risk. Unlike static test dependency reachability, this measures executed code; mocked implementations do not count as exercised. `npm run check` collects coverage once and gates coverage-aware complexity against the health baseline. No percentage gate is imposed before establishing a baseline.

## Deployment

GitHub Actions runs `npm run check` on pull requests. Pushes to `main` (or a manual
workflow run) also deploy `dist/` to <https://dkarlovi.github.io/diapason/>.
GitHub Pages must use **GitHub Actions** as its publishing source in the
repository's **Settings → Pages**. The workflow uses Node 22 and `npm ci` with
the committed lockfile; no deployment secrets are needed.
Production builds split npm dependencies into a content-hashed vendor bundle,
separate from application code, so browsers can reuse cached dependencies across
application updates. The analysis worker remains a separate bundle.
To block merges until checks pass, require the `build` job in the `main` branch protection rule.

Vite's base path is `/diapason/` so built assets load from the project URL.
The build copies `index.html` to `404.html` so direct links to capture and editor routes work on GitHub Pages.
