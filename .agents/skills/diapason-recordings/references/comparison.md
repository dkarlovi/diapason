# Compare and export recording evidence

Load when asked whether current code changes a recording, what corrections remain,
or how to obtain saved/current MIDI and complete comparison evidence.

```sh
bin/diapason compare '/path/to/recording.wav' --json
bin/diapason notes '/path/to/recording.wav' --view automatic --changed --all --json
bin/diapason stages '/path/to/recording.wav' --view automatic --all --json
```

`compare` reports saved versus current edited replay and automatic inference.
Its focused JSON contains summary counts; use `notes`/`stages` for passages and
correspondences. Corrections, mutes, timing and segmentation all matter: unchanged
note count does not imply unchanged music.

Separate historical replay mismatches from automatic-versus-intended differences.
The former can exit 1; the latter are expected feedback and do not themselves fail
a comparison. Inherited manual corrections are not automatic recoveries, and
untouched notes are not exact approved targets. State which view and source ranges
support a conclusion rather than inventing a whole-recording accuracy score.

When the user needs artifacts, select a fresh output directory:

```sh
bin/diapason compare '/path/to/recording.wav' --out '/tmp/diapason-review-unique' --format markdown
```

Replace the example destination with a new directory for this run. The export
contains complete `comparison.json`, `comparison.txt`, and `saved.mid`, `edited.mid`,
`automatic.mid`. Existing output files are refused. Without `--out`, comparison does not export reports or MIDI; it may write its
disposable cache and Vite temporary runtime files. Keep temporary exports outside the
repository unless the user requests otherwise; preserve the source WAV.

MIDI reflects playback instrument/octave and timing transforms; comparison pitches
are logical note values. A MIDI file is not a rendered listening A/B.

Current CLI does not expose `--set`, `--recipe`, `--batch`, `audition`, `corpus`,
`case` or `investigation` commands. Do not present planned workflows as working
features. Check current help if the checkout has advanced; modifying tuning code
or adding those capabilities is separate development work.
