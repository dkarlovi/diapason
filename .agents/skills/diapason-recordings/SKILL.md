---
name: diapason-recordings
description: Use when given a diapason WAV recording or investigating unexpected whistle-to-MIDI notes, saved corrections, replay differences, or recording-package import/export failures.
---

# Investigate diapason recordings

Start with the supplied WAV, from the checkout containing `bin/diapason`:

```sh
bin/diapason inspect '/absolute/path/to/recording.wav' --format markdown
```

Substitute the actual path and quote it as one argument. Inspection runs applicable
verification; use its findings to choose the next query. Use Markdown for reading,
`--json` for calculations. Check `bin/diapason --help` when capabilities are unclear;
the installed CLI is authoritative over implementation plans.

Read **only the reference needed for the current question**. Open references
individually when needed; do not batch-read or preload the reference folder.

| Question                                                                     | Reference                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| Is the package intact; why does replay/import differ?                        | [Verification](references/verification.md) |
| Why this note, correction, mute or control value; what else is similar?      | [Musical evidence](references/evidence.md) |
| What changed between saved/replay/automatic; how to export evidence or MIDI? | [Comparisons](references/comparison.md)    |
| CLI setup, cache reuse, or a fresh detector run?                             | [Runtime and cache](references/runtime.md) |

Preserve the original WAV. Analyze full context before selecting source ranges.
Explicit corrections express intent; untouched notes are unapproved. Note IDs belong
to their named view; compare source coverage across views. Use CLI queries before
ad hoc analysis scripts. Report observations, unavailable evidence and next steps;
do not present a saved correction as automatic recovery or proof of the entire tune.
