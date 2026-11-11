---
name: diapason-recordings
description: Use when investigating whistle-to-MIDI notes, interpretation controls or presets, saved corrections, replay differences, recording-package failures, or repository issues using recording fixtures, with or without an attached WAV.
---

# Investigate diapason recordings

Use `bin/diapason` as the default interface for recording evidence, including
when the task starts from an issue or a test sketch rather than an attached WAV.

If no WAV is attached, locate the issue's referenced fixtures with
`rg --files tests/fixtures` and read their manifests. Identify available audio,
package metadata, partial feedback and segment-only cases before choosing a view.
Use an existing relevant recording; do not ask for an upload already in the repo.

From the checkout containing `bin/diapason`, inspect a supported recording:

```sh
bin/diapason inspect '/absolute/path/to/recording.wav' --format markdown
```

Substitute the actual path and quote it as one argument. Inspection runs applicable
verification; use its findings to choose the next query. Use Markdown for reading,
`--json` for calculations. Check `bin/diapason --help` when capabilities are unclear;
the installed CLI is authoritative over implementation plans.

Before deriving recording evidence with a script or direct shared-module calls,
check root and relevant subcommand help, then use the supported CLI query. Check
capability per subquestion: a missing key sweep does not make ordinary tuning,
control-provenance or saved/replay queries unavailable. Ordinary source inspection,
implementation and regression tests remain development work.

If an input or experiment is unsupported, state the requested operation and the
help/diagnostic that establishes the limit, retain any supported CLI baseline,
and use a focused fallback only for that gap. For fixture types and experimental
fallbacks, read [Comparisons](references/comparison.md). An exit-1 replay mismatch
still contains usable evidence; route it to verification rather than bypassing the
tool. Do not start with `inspect --raw` when a focused report answers the question.

Read **only the reference needed for the current question**. Open references
individually when needed; do not batch-read or preload the reference folder.

| Question                                                                  | Reference                                  |
| ------------------------------------------------------------------------- | ------------------------------------------ |
| Is the package intact; why does replay/import differ?                     | [Verification](references/verification.md) |
| Why this note, correction, mute or control value; what else is similar?   | [Musical evidence](references/evidence.md) |
| Compare results, control experiments, fixture/version checks, or exports? | [Comparisons](references/comparison.md)    |
| CLI setup, cache reuse, or a fresh detector run?                          | [Runtime and cache](references/runtime.md) |

Preserve the original WAV. Analyze full context before selecting source ranges.
Explicit corrections express intent; untouched notes are unapproved. Note IDs belong
to their named view; compare source coverage across views. Use CLI queries before
ad hoc analysis scripts. Report observations, unavailable evidence and next steps;
do not present a saved correction as automatic recovery or proof of the entire tune.
