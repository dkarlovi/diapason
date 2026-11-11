# Key pull response implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved plan inline.

**Goal:** Resolve #71 by making the base key/harmony prior relative to pitch evidence linear in Pull into key.

**Architecture:** Interpretation v5 uses the full-pull prior-to-pitch ratio multiplied by the effective slider value. Versions 1–4 retain their exact scoring. Context correction and optional Max pitch move retain their separate semantics. V5 shares v4 segmentation and key precedence, with unchanged wire fields.

**Tech Stack:** TypeScript, Vitest, React capture, portable tune and WAV package codecs.

**Spec:** GitHub issue #71 and the accepted investigation in this session; related #75/#92 and #72.

## Global constraints

- Preserve published preset recipes and avoid preset identity branches.
- Preserve legacy tunes, zero/full-pull output, tuning independence, and explicit-key precedence.
- Changes apply to new recordings and fresh imports; retain saved interpretation versions.

## Review focus

- Intermediate ambiguous pitches must respond before the upper end of the slider.
- Key and chord priors share the corrected scaling.
- Versions 1–4 retain their existing intermediate decisions.
- Sharing, MIDI and WAV restoration retain v5, including contours and zero Glide.
- Discrete note changes need not occur at every slider step; fixture observations are not musical ground truth.

## Task 1: Versioned decoder response

- [x] Add failing controlled key/chord threshold regressions and fixture endpoint parity tests.
- [x] Observe expected failures, then pass interpretation version into note naming and apply the linear ratio in v5 only.
- [x] Verify intermediate response, historical decisions, and endpoint parity.

## Task 2: Persistence and integration

- [x] Add v5 round-trip and capture expectations; observe unsupported-version failures.
- [x] Extend version selection and validation, stamp new captures/fresh imports v5, and preserve v4 sources.
- [x] Update the portable format and studio guide; review README for public overview changes.
- [x] Run focused tests, independent review, and npm run check.

## Execution evidence

- Controlled key/chord and persistence regressions failed before implementation (18 expected failures); the Glide segmentation guard also caught the unsupported v5 path.
- Focused decoder, fixture parity, capture, sharing and WAV tests passed (135 tests); actual differing v4/v5 intermediate notes also survived sharing and MIDI.
- Offered presets remain distinct in legacy and v5 interpretations.
- Independent review found no correctness issues; its suggested zero-Glide curve/bend coverage was added and passed.
- README reviewed; the public overview and documentation links need no changes.

- Final `npm run check` passed: 159 test files, 1,156 tests, all quality gates, and production build. Full-recording endpoint cases use a 60-second limit for acoustic analysis under V8 coverage.
