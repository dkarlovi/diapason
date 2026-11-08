# Glide and held-note drift evaluation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve the source evidence and make segmentation experiments reproducible before selecting a production algorithm for issue #50.

**Architecture:** Evaluate `segmentMelody` directly, independently of contextual pitch correction. Keep measured contours, intended notes, and observed baseline segments distinct. This first slice supplies evidence for a subsequent algorithm design; it does not change saved interpretation semantics or claim to solve #50.

**Tech stack:** TypeScript, Vitest, existing WAV decoding and recording analysis.

**Spec:** [Issue #50](https://github.com/dkarlovi/diapason/issues/50).

## Global constraints

- Preserve source PCM unchanged and identify it by SHA-256.
- Untouched notes are preservation targets, not reviewed musical truth.
- Presets supply explicit control values; evaluation must not branch on preset identity.
- Keep segmentation and representative pitch separate from contextual correction.
- Preserve existing approved fixtures. Do not alter production detection, presets, or interpretation versions in this slice.
- A later production change must address historical interpretation/versioning and use the same results for playback, piano roll, and MIDI export.

## Investigation evidence

Investigation performed on 2026-11-08, starting from revision `cbfc8b2750548b0727f00e35491007c6e5f63ccf`.

Both available Downloads exports, ending in `1793053500844.wav` and `1793310526324.wav`, contain PCM SHA-256 `150d5d23618d70d9fd7f9e8544194a8607f357724317a455e45ef56ca7370f0a`, matching the issue. The latter is a schema-2 recording package with 814072 samples at 48000 Hz, 1586 saved frames, and five saved corrections. It predates the issue's seven-edit feedback; use the existing `whistle-moon/interpretation.json` for that feedback, rather than substituting the export's edit list.

CLI inspection passes package integrity, PCM roundtrip, source non-mutation, and import checks. Historical edited replay and MIDI comparisons report mismatches. These pre-existing mismatches must be recorded separately from any candidate changes.

The automatic view reproduces the source intervals 3.488–4.032, 4.032–4.160, and 4.160–5.013333333333334 seconds, with representative continuous pitches 92.39769421047875, 90.10679326551102, and 91.01069120521575. Tuning is +21 cents. The last interval remains G6 when the intended corrected label is F#6.

`Decode.ts` fits a piecewise-constant least-squares contour, charges a Steadiness-dependent split cost, and absorbs pieces shorter than a Steadiness-dependent slip horizon. Representative pitch is the median after trimming one fifth from each end. There is no explicit distinction between a stable short step and a moving transition.

Disposable synthetic probes used 512/48000-second frame hops, RMS 0.1, clarity 0.99, Minimum note length 80 ms, and the remaining As played control values. These are algorithm probes, not user-reviewed performances:

| Contour                                                       | Steadiness 0 | Steadiness 0.6       | Steadiness 1         |
| ------------------------------------------------------------- | ------------ | -------------------- | -------------------- |
| MIDI 76→77 linear drift over 94 frames                        | 3 regions    | 1 region, pitch 76.5 | 1 region, pitch 76.5 |
| 47 frames at 72, 28-frame linear slide to 79, 47 frames at 79 | 5 regions    | 2 regions            | 2 regions            |
| Mirrored descending slide                                     | 5 regions    | 2 regions            | 2 regions            |
| 12 frames each at 76, 77, 78 (128 ms each)                    | 3 regions    | 1 region at 77       | 1 region at 77       |
| 47 frames each at 76, 77, 78                                  | 3 regions    | 3 regions            | 3 regions            |
| 188 frames of 4 Hz, ±0.8-semitone vibrato about 76            | 16 regions   | 1 region             | 1 region             |

The slide split at Steadiness 0.6 and 1 is at 0.7466666666666667 seconds, near the end of the transition; retaining endpoint labels alone does not establish correct source boundaries.

`npm test -- src/Melody/Decode.test.ts src/Melody/Interpret.test.ts` passes: 40 tests across two files. No production code was changed during investigation.

## Review focus

- The 4.032–4.160 and 4.160–5.013 s regions have the same intended F#6 pitch if the latter correction is applied. Review whether they are two notes or one held note before setting expected boundaries.
- Preserve quick stable steps while suppressing transition staircases; count and source coverage matter independently of pitch labels.
- Test ascending and descending motion symmetrically, including attack overshoot and release drift.
- Articulation dips and silence must continue to preserve repeated notes, including equal-pitch notes.
- Synthetic intent is defined by construction; real-recording intent remains limited to explicit reviewed feedback.

### Task 1: Preserve the full-context Moon source fixture

**Files:** Create `tests/fixtures/whistle-moon/original.wav` and `manifest.json`; modify `tests/support/fixtures.ts`; create `src/Melody/Contours.integration.test.ts`.

**Interfaces:** Extend `loadFixture`'s name union with `"whistle-moon"`; retain its existing return shape. The manifest records package-file SHA-256, PCM SHA-256, sample rate 48000, sample count 814072, BPM 111, and the distinction between the older package edits and the existing seven-edit interpretation fixture.

- [x] Write a fixture integration test that loads Moon and checks sample count, sample rate, and PCM identity against the manifest. Use the existing PCM identity implementation rather than hashing Float32 bytes.
- [x] Run `npm test -- src/Melody/Contours.integration.test.ts` and verify the missing fixture produces the expected failure.
- [x] Copy the matching schema-2 source WAV into the fixture directory unchanged, create its manifest, and extend the fixture loader. Do not use a Downloads or temporary path in committed tests.
- [x] Assert that `segmentMelody` with the recorded detection values (Steadiness 1, Minimum note length 80 ms, Silence gap 90 ms, Level gate 0.003) reproduces the existing Moon segment source ranges and pitches within numeric tolerance. This is a baseline characterization, not an assertion of musical correctness.
- [x] Run the new integration test and `src/Melody/AutoTune.test.ts`; all must pass without changing the existing seven-edit expectations.

### Task 2: Record the contour evaluation corpus

**Files:** Create `tests/fixtures/contours/cases.json` and `tests/support/contours.ts`; create `tests/support/contours.test.ts`; extend `src/Melody/Contours.integration.test.ts`; review `README.md` and update `docs/limitations.md`, `docs/architecture.md`, and `docs/development.md` with the contour investigation's scope, limitations, and regression evidence.

**Interfaces:** `contourFrames` consumes a declarative case and returns `Frame[]`. Put shared case/expectation shapes in `tests/support/contours.type.ts`. Cases describe frame counts, continuous pitch endpoints, and RMS; expectations separately describe intended source ranges and pitches, review status, and observed baseline results at Steadiness 0, 0.6, and 1.

- [x] Test exact frame times and frequencies for constant pitch, linear motion, sinusoidal vibrato, a level dip, and silence before writing the generator.
- [x] Run `npm test -- tests/support/contours.test.ts` and confirm the missing generator fails.
- [x] Implement the generator and preserve the six measured probe cases above. Add continuous articulated runs, repeated notes with a level dip, a silent separation, intentional chromatic steps, and a deliberate glide. Record ambiguous cases without inventing a discrete-note expectation.
- [x] Assert baseline observations, plus reviewed preservation expectations that already pass, directly against `segmentMelody`. Keep desired improvements explicit as evaluation data; do not add failing tests to the main suite or label known failures as successes.
- [x] Check pitch, note count, start/end boundaries, and source coverage separately. Keep contextual correction out of the evaluation. Use the same effective controls for opposite-direction cases.
- [x] Run focused corpus tests, then `npm run check`. Fix new gate findings without expanding baselines to absorb regressions.

## Subsequent algorithm decision

Use this corpus to compare evidence for plateau-supported pitch steps, moving transitions, and representative-pitch selection. Increasing the split penalty or anchoring every note to its attack is not justified by the current evidence. Select and document a candidate only after reviewing ambiguous real contours, then add desired-behavior failing tests before implementation.

Production acceptance additionally requires full-context baseline/candidate audio and MIDI, an inventory of every changed source range, preservation of approved fixtures, explicit saved-interpretation compatibility, and review of intentional glides and quick chromatic movement. The first slice above does not satisfy those acceptance requirements by itself.

## Execution record

The source WAV is now preserved unchanged with file and PCM hashes in its manifest. Full-context analysis reproduces all 32 stored Moon segments; the seven-edit interpretation fixture remains unchanged.

The corpus contains 19 synthetic contours evaluated at Steadiness 0, 0.6, and 1: 57 baseline observations, of which 32 meet their constructed intent, 19 differ, and six leave the deliberate glide representation unreviewed. A matching result uses a 0.2-semitone pitch tolerance and exact source boundaries or coverage of endpoint plateaus as specified per case. These counts do not establish real-performance accuracy.

A read-only review identified missing mirrored attack/release and other directional examples. Eight required mirror pairs now have an executable coverage check; seven failed before the missing cases were added. The focused generator and contour tests pass (103 tests). No production algorithm, preset, control, UI, or interpretation version changes are included.

Verification ran the full coverage suite: 146 files and 1,026 tests passed. Two existing integration tests needed 60-second budgets for coverage overhead; their assertions are unchanged. Fallow then rejected a complex corpus type guard, which was split into smaller functions without growing a baseline. The refactor passes the 103 focused tests, typecheck, lint, architecture, structure, audit, health, and production build. Production coverage remains from the passing full run; the test-only validation refactor does not change production code.

The updated repository documentation instructions keep the public README unchanged after review. Maintained guides now describe detection limitations, representative-pitch calculation, and the contour corpus. The implementation remains uncommitted on `issue-50-contour-evaluation`; ambiguous real note boundaries, exact slide transition allocation, and the intentional glide's discrete MIDI representation remain open.

Final verification after the type-guard refactor: all 1,026 tests passed across 146 files (96.92 seconds). Typechecking, lint, naming, architecture, structure, formatting, duplication, audit, health, and the production build passed individually. No quality baselines were changed.
