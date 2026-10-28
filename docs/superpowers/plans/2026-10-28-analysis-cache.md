# Persistent worker analysis implementation plan

**Goal:** Resolve #29: analyze immutable takes once without blocking the UI, sharing progress across Library and Editor.

**Architecture:** A module-owned job registry deduplicates requests by recording ID and versioned analysis options. IndexedDB v3 holds packed Float64 frames separately from recordings (preserving exact diagnostic precision). A module worker receives an exclusively owned decoded PCM buffer by transfer and reports progress. Analysis starts on demand; background pre-analysis and detector arithmetic changes are deferred.

**Tech stack:** React, TypeScript, Vite module workers, IndexedDB, Vitest.

- [x] Add regression tests and storage for exact packed frames, key invalidation, upgrades, and deletion including analysis finishing after deletion.
- [x] Add progress to the existing analysis loop, worker transport, and shared jobs. Test cache reuse, concurrent callers, option/version invalidation, progress, transfer ownership, failures/retry, and worker cleanup.
- [x] Integrate shared jobs with Editor loading and Library MIDI previews. Show accessible progress/error/retry, retain audio controls, gate editing/MIDI/export, and verify navigation reuses work.
- [x] Update README, run focused regression tests and full `npm run check`, inspect the final diff.

**Review focus:** Cache rounding must never change exports; deletion must not resurrect cached data; jobs survive navigation but release workers and PCM; stale completions cannot affect a new recording; errors permit retry. No optional detector optimization in this change.

Validation: `npm run check` passed, including unchanged approved MIDI fixtures. Real
headless Chrome analyzed an 81-second take with advancing progress and 116 timer
ticks while the worker ran; a full-page reopen spawned zero workers and retained
100 notes. Review found and resolved quota handling: computed frames remain usable
when cache persistence fails, with an explicit warning. Progress fits beside Tune.

Library progress uses the top border as an overlay, preserving row geometry and
all existing content positions while analysis runs.
