# Inspect a recording

[Project overview](../README.md)

This is the human CLI reference. Agents investigating a supplied WAV should use the [diapason-recordings skill](../.agents/skills/diapason-recordings/SKILL.md), which routes to focused verification, evidence, comparison, and runtime procedures.

Download a WAV from the editor. From a checkout with Node 22.18+ and dependencies
installed using `npm ci`, inspect its embedded evidence with `bin/diapason`.
The CLI reads the file without starting the browser or requesting a microphone.

Start with:

```bash
bin/diapason inspect recording.wav
bin/diapason inspect recording.wav --format markdown
bin/diapason inspect recording.wav --json
bin/diapason inspect recording.wav --raw --json
bin/diapason compare recording.wav --out /tmp/diapason-comparison
```

`inspect` reads the saved settings, named notes, edits, mutes, quality, build
identity, and pitch evidence; `--format markdown` produces an agent-readable report; `--json` returns a focused,
versioned report. Use `--raw --json` for the complete original saved metadata.
Text is the default,
with `--color auto|always|never` and `NO_COLOR` support. Default inspection runs applicable verification and prints a compact summary.
`verify recording.wav --format markdown` exposes individual results, first
differences and maximum numeric deltas, including harmless rounding. Checks cover
package/PCM integrity, edited replay, exact MIDI bytes, independently read musical
events, restore/fresh imports, PCM round trips and source non-mutation. An optional
installed `ffprobe` provides an independent WAV interoperability check; absence
is reported as skipped. Historical/current build differences are reported
separately from result differences. `compare recording.wav --json` is read-only;
add `--out` only when reports/MIDI artifacts are wanted.

## Computation cache

Acoustic frames are cached losslessly across CLI invocations in an owner-private
`os.tmpdir()/diapason-<uid>/cache/v1` directory. Entries expire after seven idle
days or when the cache exceeds 1 GiB. Each invocation reads, hashes and validates
the actual WAV and checks it again after computation. Full WAV identity distinguishes
packages containing identical PCM with different corrections; frame reuse depends
only on PCM, sample rate, detector settings and current source/dependency/runtime
identity. Verification JSON records stage keys and `reused`/`recomputed` provenance.
Combined interpretation/export snapshots are validated before reuse and remain
package-specific; historical comparisons and import checks run on every call. A cache hit therefore does not claim fresh detector execution. Corrupt or
unavailable storage falls back to computation with diagnostics on stderr.

Use `--cache-dir <directory>` to select another private disposable cache, or
`--no-cache` to bypass both reads and writes. `bin/diapason cache status --json`
reports entries and size; `bin/diapason cache clear` removes computation entries.
Either maintenance command accepts an optional WAV path to select entries used by
that package. Clearing shared acoustic entries also makes other packages recompute
them. Cache maintenance leaves recordings and durable artifacts untouched.

## Compare saved and current results

`compare` uses the current analysis code to reproduce the edited result and to
analyze without manual pitch edits, their protected boundaries, or mutes. It
compares source time ranges so note splits and merges remain visible. Explicit
corrections express intent; untouched notes are not automatically approved, and a
mute is not proof that the source was unvoiced.

The output directory receives `comparison.txt`, `comparison.json`, `saved.mid`,
`edited.mid`, and `automatic.mid`. Existing output files are refused; use a new
directory for each experiment. MIDI uses the selected playback instrument/octave;
comparison pitches remain logical. Exit codes are 0 for valid inspection or a
matching edited replay, 1 for a replay difference, and 2 for invalid input/usage or an
unavailable baseline. Automatic-versus-edited differences alone do not fail. Numeric evidence allows
`1e-9` absolute floating-point tolerance between browser and Node; MIDI bytes
must match exactly.
Schema-1 packages can be inspected, but have no saved melody to compare.

The WAV's PCM data chunk is hashed with SHA-256 and checked before comparison.
Saved observations remain separate from recomputation. The tool leaves the input
WAV unchanged and is intended for repeated use throughout decoder tuning.

## Query notes, controls, and stages

Focused evidence queries use the same output formats:

```bash
bin/diapason notes recording.wav --corrected --format markdown
bin/diapason notes recording.wav --view automatic --time 1.4:2 --json
bin/diapason notes recording.wav --similar-to 5 --cents 35 --json
bin/diapason controls recording.wav --all --format markdown
bin/diapason stages recording.wav --view replay --note 5 --json
```

Views are `saved` (the default historical observations), `replay` (current edited
recomputation), and `automatic` (current inference without manual edits, protected
boundaries or mutes). All analysis uses the complete recording; `--note` and
`--time` select rows afterwards. Note IDs belong to the selected view. Stage
comparisons join source coverage and retain split, merge, missing and extra
correspondences, including all current parts of a selected saved passage.

`notes` joins continuous measured pitch, tuning, nearest/decoded/final labels,
explicit correction state and mutes. Untouched notes have no approved intended
pitch. `--corrected`, `--muted` and `--changed` filter rows; `--changed` compares
against saved observations. `--similar-to` compares continuous pitch within the
explicit cents radius (35 by default), without claiming a repeated musical figure.
`controls` includes shared definitions, preset values, saved override membership,
effective values and historical defaults. Lists default to 20 rows; use
`--offset`/`--limit` or `--all`, with continuation commands and omitted counts.
Capture-only WAVs report unavailable melody evidence. Frame trajectories, decoder
explanations and recipe experiments are not implemented yet.

Development exports report unknown source identity; production exports include
build/pipeline identity. Browser/output descriptions are context, not a snapshot
of an external synth's sound. Legacy JSON/WAV replay remains internal support for
older regression fixtures, rather than the current sharing workflow.
