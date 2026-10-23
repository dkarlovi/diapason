# Recording wizard validation

Implemented on branch `recording-wizard`; implementation changes remain uncommitted for review. The terminology rename was committed externally as `3618e5f` during this work and has been preserved.

## Automated verification

- `npm run check`: exit 0, including TypeScript, oxlint, oxfmt, duplication, coverage tests, Fallow audit/health, and production build.
- Vitest: 31 files, 107 passing tests.
- Duplication: no clones; committed duplication and health baselines unchanged.
- Regression coverage includes persistent results after silence, gated progression, invalidation/recovery, empty/interrupted/gapped sampling, unknown microphone settings, timestamped recorder PCM, per-context worklet registration, tap/clap algorithms, late subscription cleanup, preview cancellation, suspended count-in clocks, saved profile analysis, and cache invalidation.
- Existing advisory health/styling findings remain report-only; the required audit passes.

## Chrome smoke test

Headless Chrome used an explicitly injected synthetic Web Audio microphone. This is browser integration validation, not physical microphone validation.

Verified all six steps; room and sound measurements passed; metronome preview transitioned to clap listening; seven synthetic claps yielded a stable 120 BPM estimate; count-in and recording saved a recording at `/diapason/recording/:id`; editor opened and displayed the saved tempo and analyzed notes. No runtime exceptions. A 390 px viewport had no horizontal overflow. Screenshots are available locally at `/tmp/diapason-wizard-tempo.png` and `/tmp/diapason-wizard-recording.png`.

## Review and implementation decisions

A fresh reviewer found five Important issues; all received regression tests and fixes: interrupted sampling, inaccessible gain recovery, false completed summaries, revoked unknown-setting acknowledgment, and residual scheduled preview clicks. Recorder registration/timestamps and late clap messages were also fixed and tested.

- Workspace: native worktree creation succeeded outside writable roots; sandbox denied writes there. Used the current checkout on a feature branch. Cost: no separate directory isolation. The unused managed attachment was left intact.
- Commits: leave new implementation changes uncommitted for user review. Cost: working-tree changes must be committed before sharing the branch.
- Measurement lifecycle: one shared `useMeasurements` hook replaces two planned near-identical hooks. Cost: a combined room/sound API; verdicts remain separate pure functions.
- Playback: library/editor owners already stop playback on route unmount. Only wizard tempo playback needs explicit stopping before measurements. Cost: no new global playback registry; revisit if concurrent playback is introduced.
- Count-in: audio-clock callback polling is included in scope to keep suspended-context UI aligned. Cost: up to approximately 25 ms visual callback latency.
- Module boundaries: setup, recording resources, step controls, tempo estimates, and worklet registration are separate modules to satisfy the unchanged health/duplication gates. Cost: additional internal files.

No deferred Minor review findings.

## Remaining manual validation

Real microphone checks remain necessary: laptop/external inputs, quiet/noisy rooms, actual whistles/claps, physical clipping, room/sound threshold tuning, permission UX, unplug/reconnect, and real speaker bleed. Full keyboard/screen-reader and visual moving-grid/audio synchronization checks across supported browsers also remain manual. Synthetic tests must not be presented as proving acoustic accuracy or cross-browser hardware behavior.

Humming and instruments remain future capabilities. Whistling is the only exposed profile; no take URL aliases or redirects were retained. Existing stored recording audio and user-authored names are preserved.

## UX follow-up

The live monitor now uses the editor’s responsive two-column layout, on the left of the wizard, with a chart overlay before microphone connection. BPM starts empty and no vertical tempo/time lines are drawn until a valid tempo is selected or detected. Preview beat lines are unnumbered; count-in and recording show bar numbers. Gain is shared between microphone setup and room-noise recovery, rather than the live monitor. The bar-line caption was removed.

Chrome checked the side-by-side desktop geometry, chart overlay, blank initial tempo, unnumbered preview, recording bar numbers, mobile overflow, clap detection, and saving. No runtime exceptions. Follow-up screenshots: `/tmp/diapason-ux-disconnected.png`, `/tmp/diapason-ux-desktop.png`, `/tmp/diapason-ux-mobile.png`, `/tmp/diapason-ux-recording.png`. Acoustic validation remains a separate manual task.
