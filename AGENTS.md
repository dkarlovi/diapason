# Repository Guidelines

## Project Structure & Module Organization

diapason is a fully client-side whistle-to-MIDI studio built with React, TypeScript, and Vite. `src/main.tsx` mounts the app; `src/router.ts` defines route helpers. Screens and shared controls live in `src/components/`, browser effects in `src/hooks/`, and pure screen calculations in `src/capture-model.ts` and `src/editor-model.ts`. Audio processing, MIDI/WAV encoding, and IndexedDB storage are separate modules under `src/`. Tests sit beside their source files. Shared styles live in `src/styles.css`; `index.html` is the HTML entry point. Plans live in `plans/` and `docs/superpowers/plans/`. Generated output goes to `dist/` and `coverage/`.

## Build, Test, and Development Commands

Use Node 22+ and install locked dependencies with `npm ci`.

- `npm run dev`: start Vite at `http://localhost:5173/diapason/`.
- `npm run build`: typecheck, build `dist/`, and create the Pages fallback.
- `npm run preview`: serve the production build locally.
- `npm test`: run Vitest in jsdom.
- `npm run test:coverage`: collect V8 coverage reports.
- `npm run format`: apply oxfmt formatting.
- `npm run check`: run typechecking, oxlint, formatting checks, Fallow checks, coverage tests, and the production build.

Fallow checks require `origin/main` and `HEAD^`. Avoid growing the committed duplication and health baselines.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, double quotes, and semicolons; let oxfmt enforce formatting. Use PascalCase component filenames (`Capture.tsx`), `use`-prefixed hooks (`useCapture.ts`), and descriptive lowercase or kebab-case module names (`editor-model.ts`). Prefer explicit type-only imports. Keep browser effects in hooks and reusable calculations in pure modules.

## Testing Guidelines

Use Vitest and React Testing Library. Name tests `*.test.ts` or `*.test.tsx`; use `*.integration.test.tsx` for integration scenarios. Cover observable behavior and regressions, mocking browser audio or MIDI APIs where needed. Run a focused test with `npm test -- src/take.test.ts`. Coverage includes all production TypeScript; no percentage threshold is currently enforced.

## Commit & Pull Request Guidelines

Review and update `README.md` on every feature branch so it reflects the resulting app behavior, available features, setup instructions, and known limitations. Remove or revise roadmap ideas as they are implemented.

History uses short descriptive subjects such as `React UI` and `Fallow health`; no mandatory prefix convention is evident. Keep commits focused. Describe the problem, resulting behavior, and validation in pull requests; link relevant issues and include screenshots for visible changes. Run `npm run check` before submission. GitHub Actions checks pull requests targeting `main`; pushes to `main` deploy to GitHub Pages.

## Browser Configuration

Microphone access requires localhost or HTTPS. Preserve the `/diapason/` base path and remember recordings persist locally in IndexedDB.
