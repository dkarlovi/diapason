# Investigate notes and controls

Load for a wrong note, user correction, mute, control question, nearby passage or
similar measured pitch. Commands below use the supplied WAV path.

## Choose the evidence view

| `--view`          | Evidence                                                                     |
| ----------------- | ---------------------------------------------------------------------------- |
| `saved` (default) | Historical observations and edits embedded in the WAV.                       |
| `replay`          | Current recomputation retaining saved edits and mutes.                       |
| `automatic`       | Current inference without manual edits, their protected boundaries or mutes. |

A note ID is local to its view. Obtain IDs in the selected view before using
`--note`. To follow the same passage across views, use its absolute source range;
segmentation can split or merge notes.

## Follow corrections or a local problem

```sh
bin/diapason notes '/path/to/recording.wav' --corrected --format markdown
bin/diapason notes '/path/to/recording.wav' --view saved --note 5 --json
bin/diapason notes '/path/to/recording.wav' --view automatic --time 1.4:2 --json
bin/diapason stages '/path/to/recording.wav' --view replay --time 1.4:2 --json
```

Replace illustrative IDs/ranges with values from this recording. `--time` uses
absolute seconds from recording downbeat; it and `--note` are mutually exclusive.
Selection filters results after full-context analysis; do not crop the WAV first.

`notes` joins continuous measured MIDI pitch, tuning in cents, nearest/decoded/final
labels, explicit intended pitch, edit state and mute state. A null `intendedMidi`
means no explicit pitch correction, not approval of the automatic label.
`--muted` selects mutes; `--changed` selects changes from saved observations and is
most useful with a current view.

`stages` compares saved observations with the selected view through source
coverage. Inspect `kind`, every `current` correspondence and `firstDifferingStage`.
Retain split, merge, missing and extra relations; never pair cross-view arrays by
index. A first differing stage locates an observed change, not its proven cause
or a historical decoder scoring trace.

## Similar pitches and effective controls

```sh
bin/diapason notes '/path/to/recording.wav' --view saved --similar-to 5 --cents 35 --json
bin/diapason controls '/path/to/recording.wav' --view replay --all --format markdown
```

Similarity uses continuous measured pitch distance in cents (default radius 35),
not proof of a repeated musical figure. Controls expose ranges/options, steps,
preset-supplied values, saved override membership, historical defaults, effective
values and interpretation versions. Preserve explicit zero and fractional
values. Presets supply controls; preset identity must not change the algorithm
when effective inputs and versions are equal.

Lists default to 20 rows. Read `scope` and follow `nextSteps`, or use `--offset`
and `--limit`; `--all` requests every selected row and conflicts with pagination.
Do not claim a complete inventory from a partial page.

Current CLI lacks `explain`, `frames` and decoder traces. Use the available stage
and note evidence, state what remains unknown, and check help before suggesting
newer commands. Do not invent detector rejection reasons or path-score margins.
