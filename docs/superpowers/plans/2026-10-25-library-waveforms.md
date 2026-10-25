# Library waveform thumbnails

**Goal:** Implement [issue #15](https://github.com/dkarlovi/diapason/issues/15) using its specified design.

**Architecture:** Store optional version 1 RMS summaries with recordings, computed from trimmed PCM. Render 80 energy-pooled bars as a compact negative-space cutout in a full-height gradient, starting at the label while the gradient starts flush with the row. Missing summaries show only the gradient. Preserve row geometry and expose no extra controls. Backfill one legacy recording at a time in a cancellable hook, yielding between records, and merge summaries using an IndexedDB read/write transaction.

**Tech stack:** React, TypeScript, IndexedDB, SVG, Vitest.

- [x] Add pure summary and display calculations with tests for silence, short audio, time coverage, distinct envelopes, and energy pooling. Save summaries during capture and verify the saved payload.
- [x] Add atomic summary persistence with tests for typed-array reloads, legacy compatibility, concurrent edits, existing summaries, and deletion.
- [x] Render the approved decorative gradient and waveform cutout behind each Library row. Add sequential background backfill with cancellation and failure isolation. Test the gradient fallback, no decoding for saved summaries, incremental legacy updates, duplication, and unmount behavior.
- [x] Update README, review the diff, and run `npm run check` (278 tests passed; production build and Fallow baseline checks passed).

Review focus: uneven bucket sizes, silent input normalization, stale backfill overwriting edits, deleted recordings reappearing, and multiple decodes running concurrently. No database schema bump or runtime dependencies are needed. Tests use fake-indexeddb to exercise real transactions and structured cloning.
