# Layered recording investigation CLI

Status: approved by the user on 2026-10-30; implementation planning requested.

## Intent and decisions

Issue [#48](https://github.com/dkarlovi/diapason/issues/48), including its
[investigation comment](https://github.com/dkarlovi/diapason/issues/48#issuecomment-6519032312),
describes an investigation interface, not a tuning algorithm change. An agent
should be able to start with a WAV, verify it, understand specific decisions,
compare control changes, listen, retain reviewed evidence, and check a code fix
without ad hoc analysis scripts or temporary source instrumentation.

The user chose focused, independent commands over a persistent session and
suggested a temporary cache keyed by recording hash. The user also requires
off-the-shelf CLI infrastructure, installed as development dependencies, and
output suitable for agents, including Markdown. The decisions below beyond those
requirements are proposals by the designer.

The central rule is: compute the necessary evidence, present a small answer, and
provide concrete ways to browse deeper. Printing less must not mean silently
performing fewer verification checks.

## Approaches

1. **Focused commands plus disposable cache and explicit durable artifacts.**
   Chosen by the user. Every command identifies its WAV and options; the cache
   avoids repeating expensive analysis. Durable artifacts are optional and
   explicit. Commands remain understandable after a restart or cache eviction.
2. **Persistent investigation session.** Avoids repeating input selection but
   adds lifecycle, stale-session, and recovery behavior. Rejected in favor of
   commands that work independently.

For the CLI shell, use Commander, Chalk, and cli-table3. Commander supplies
subcommands, argument/option validation, generated help and usage errors; Chalk
supplies terminal styling; cli-table3 supplies terminal table layout. oclif was
considered but its command discovery/plugin framework is unnecessary for this
repository-local tool, and its current UX package still delegates tables to
other libraries. Do not replace Node parseArgs with another homemade dispatcher.

Use mdast-util-to-markdown with mdast-util-gfm-table for Markdown serialization,
including escaping, tables and code fences. markdown-table alone was considered
but explicitly leaves escaping to callers. All CLI libraries belong in
devDependencies and must stay outside the browser import graph. Continue using
the existing Vite SSR mechanism to load application TypeScript. No interactive
terminal application, server, plugin system, or new CLI build pipeline is needed.

References: [Commander](https://github.com/tj/commander.js),
[Chalk](https://github.com/chalk/chalk),
[cli-table3](https://github.com/cli-table/cli-table3),
[Markdown serialization](https://github.com/syntax-tree/mdast-util-to-markdown),
[oclif UX](https://github.com/oclif/core/blob/main/src/ux/README.md).
Choose compatible locked releases at implementation time; preserve the project's
documented Node requirement or explicitly document any required minimum increase.

## Goals, constraints and non-goals

- Answer the entire investigation workflow through bin/diapason, in coherent
  increments rather than unrelated experimental commands.
- Share the application's readers, validation, detector, interpretation, edit,
  import, timing, MIDI and portable-tune functions. No parallel analysis engine.
- Keep source WAV and browser IndexedDB unchanged. Only cache writes occur by
  default; generated reports, MIDI, listening files and cases require --out.
- Preserve full-context analysis. Time/note selectors filter results after
  analysis; they never quietly crop the detector or decoder inputs.
- Presets supply control values only. Same effective controls, input and
  interpretation version produce the same result regardless of preset identity.
- Distinguish user corrections, approved expectations, unreviewed preservation
  targets, and subjective listening preferences. Never infer approval from silence.
- Do not change tuning algorithms, add hidden musical controls, automatically
  modify recordings, install renderers, or claim to recover an exact intended tune.
- Initial support remains diapason-exported WAVs, including readable schema-1
  limitations. Generic audio ingestion is a separate feature.

## Commands and browsing model

The common form is bin/diapason <command> <wav> [options]. Commands below are the
target interface, not a claim that they already exist. Nested commands use spaces.

| Command                        | Focused answer                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| inspect                        | Executive summary, applicable verification results, findings and next steps         |
| verify                         | Detailed per-check results, deltas and failure paths                                |
| notes                          | Joined note rows; filter corrections, mutes, changed notes, time or similarity      |
| explain                        | One selected note's pitch trajectory through stages and decision explanation        |
| frames                         | Local time bins by default; individual full-resolution frames on request            |
| stages                         | Where labels, timing or segmentation first differ                                   |
| controls                       | Definitions, effective values, overrides and historical/current provenance          |
| patterns                       | Repeated/transposed figures and local tuning evidence, with uncertainty             |
| compare                        | Saved/replay/automatic or explicit candidate comparison; optional batch experiments |
| corpus                         | Apply an explicit comparison recipe to reviewed/unreviewed registered cases         |
| audition                       | Export comparable listening renders and a playback-time manifest                    |
| case export                    | Export an explicitly scoped, reproducible regression case                           |
| investigation export / inspect | Retain or summarize explicit questions, runs and review status                      |
| investigation review           | Record explicit partial expectations, listening preference or unresolved review     |
| cache status / clear           | Show or remove only this tool's disposable cache                                    |

inspect is the entry point; do not require a session-opening command. Keep
inspect and compare spellings; a bare WAV alias is unnecessary initially.
inspect --json intentionally changes from a complete metadata dump to a focused
versioned report. Preserve access to the original package with
inspect --raw --format json, and document this compatibility change. Raw output
is explicit and mutually exclusive with summary selectors.

Use --view saved|replay|automatic for evidence queries; saved is their default.
Saved means immutable observations in the WAV. Replay means current code with
saved applied intent. Automatic means current code with explicit resolved
controls and no pitch edits, protected edit boundaries or mutes. Reports always
name their view and current/saved interpretation/build identities. Experiments
accept --recipe <file>; a recipe can be used by explain and frames as well as
compare, so inspecting a candidate never requires a surviving cache ID.

--note selects a UI note ID within the named view. Every response returns its
absolute source range and view identity. Cross-view correspondence uses source
coverage and classifies matched/split/merge/missing/extra relations; it never
assumes array positions or note IDs survive segmentation changes. --time
<start:end> uses absolute seconds from recording downbeat. An explain request
whose source maps to multiple current notes reports all correspondences and
offers narrower commands instead of silently picking one.

Lists default to a bounded page, proposed 20 rows, with total/returned counts,
stable ordering and a ready-to-run --offset/--limit continuation. --all explicitly
requests the full selected list. A report's scope and omitted counts are the
same in text, Markdown and JSON. Machine consumers can request all rows without
unrelated arrays or MIDI bytes. Comparisons retain every difference in their
result data even when the presentation is paginated.

## Output contract

--format text|markdown|json is universal; --json aliases --format json. Conflicting
format options fail clearly. Text remains the default regardless of TTY;
agents are documented to use Markdown for reading and JSON for computation.

All formats render one typed domain report. Reports contain schemaVersion,
kind, input identity, selected view/recipe, execution identity, scope,
overall result, findings, command-specific data and nextSteps. JSON includes
raw numbers and next-step argv arrays as well as descriptions. Human formats
round display values and show units. Each suggested command includes actual
input path, selectors, view, recipe and requested format; render shell arguments
with correct quoting through an established argument-quoting utility. No shell
evaluation or user-controlled command fragments.

Use compact prose, small tables and fenced shell commands in Markdown. Serialize
a Markdown AST instead of assembling escaped tables by hand. Terminal output uses
Chalk's capability detection plus --color auto|always|never and NO_COLOR support.
Color reinforces textual pass/fail labels; it carries no unique information.
Markdown and JSON contain no ANSI escapes. Progress and diagnostics go to stderr;
stdout contains exactly the requested report, including structured JSON failures.
No prompts or automatic pager. Narrow terminal layouts may wrap or stack rows
using library facilities without dropping result fields.

An inspect summary should normally fit roughly 30 lines. It contains identity,
audio/tempo basics, note/edit/mute counts, quality/key/tuning highlights, one row
per verification group, up to three prioritized findings and up to three next
commands. Detailed settings, all notes, key candidates, frames and byte arrays
belong in focused queries. Group counts may abbreviate many failures but must
show the total and provide a command to retrieve them all.

For the supplied WAV the observed summary facts are: Fly me to the moon,
16.960 seconds, mono PCM16 at 48 kHz, 111 BPM, 4/4, 32 saved notes,
seven active pitch corrections, no mutes, and 1,586 saved frames. A possible
Markdown summary excerpt, omitting verification rows whose results have not yet
been measured by the proposed tool, is:

````markdown
## Fly me to the moon

16.960 s · 48 kHz mono · 111 BPM · 4/4
32 saved notes · 7 pitch corrections · 0 mutes

### Investigate

Seven explicit corrections are available as feedback. The other 25 notes
have not been approved as an exact transcription.

List the corrections and their source evidence:

```sh
bin/diapason notes '/path/to/recording.wav' --corrected --format markdown
```

Explain the earliest correction, D#6 → D6 at 1.483–1.920 s:

```sh
bin/diapason explain '/path/to/recording.wav' --note 5 --format markdown
```
````

Actual output must use the caller's path, not this illustrative placeholder.

## Verification semantics

inspect runs the applicable checks from the issue and summarizes them; verify
exposes details. Cache hits reuse exact computation results, while input reading,
hashing, container validation and source non-mutation checks apply to this call.

The checks are: container/package integrity and PCM identity; edited replay;
MIDI byte equality and independently compared musical events; in-memory restore
and fresh import; PCM encode/decode preservation; automatic versus intended
comparison; optional ffprobe interoperability; and source non-mutation. Import
checks include visible/hidden edit intent, mute coverage, control values and
versions, playback settings and preserved received reference. A focused portable
verification option also covers share/MIDI/WAV round trips and equivalent preset
recipes. No IndexedDB writes occur.

Each check returns pass, fail, mismatch or skipped plus reason, relevant paths,
identities and numeric deltas. fail denotes invalid input, contradiction or an
invariant violation; mismatch denotes a valid historical observation differing
from current recomputation. Expected manual corrections are findings, not failed
integrity. An unknown development build is unknown, not equal. ffprobe absence
is skipped. Skipped checks remain visible; schema-1 input cannot claim full
verification. Report absolute tolerance 1e-9 and maximum observed deltas with
paths even below tolerance. MIDI bytes compare exactly; logical musical events
and playback transformations are reported separately.

Overall results are pass, incomplete, mismatch or fail. Fail dominates mismatch,
which dominates incomplete; optional ffprobe absence alone does not downgrade
overall pass. Exit 0 for valid query/pass/incomplete with explicit skipped
checks, 1 for observed replay or declared regression-expectation mismatch, and
2 for invalid input/usage or a required operation that cannot execute. Merely
finding explicit automatic/intended differences is exit 0. Compare can return
those differences even if inspect would report a separate replay mismatch.

Validation diagnostics carry a field path/check ID and distinguish malformed
data, unsupported schema/semantics, and missing historical defaults. Extracted
unvalidated context may help explain an error but must be marked untrusted and
must not enter analysis. Missing historical controls use documented,
version-specific defaults; never today's preset defaults by accident.

## Evidence and explanations

notes joins UI identity/source range, continuous measured pitch, tuning in cents,
tuned residual to the intended pitch, nearest/decoded/final labels, intent and
coverage. Similarity search compares measured continuous pitch within an explicit
cents radius, optionally also trajectory, and shows the distance and context.
Do not call similarity a repeated musical figure.

explain follows frames → segmentation/representative pitch → tuning → nearest
label → decoded label → postprocessing/timing → manual edit/mute → playback.
It shows relevant controls, scale membership and applicable inferred chord.
Frame bins include range/median, voiced/rejected counts, clarity and RMS, with
explicit no-data status. Show representative-pitch contribution/trim rules,
neighboring short segments and drift evidence. Historical frames do not retain
every detector rejection reason; return unavailable where it was not recorded,
and offer a current replay trace rather than inventing historical detail.

Decoder explanations must instrument the shared calculation, not reimplement
its formulas in the CLI. Optional tracing returns candidate eligibility,
acoustic/key/chord/context contributions, transitions, winning path and score
margins, plus post-decoder changes. A local emission margin is not a Viterbi
path margin: use a complete-path constrained alternative for an intended label
when claiming why it lost. Keep the computation full-context. A tracing-on/off
regression must prove identical musical results. Saved observations lacking a
trace cannot be described as a known historical decision; explain the current
replay separately and show its correspondence to saved stages.

patterns reports explicit similarity measures, candidate repeated/transposed
figures, and windowed tuning estimates with sample counts and uncertainty.
Changing note mix can confound a tuning trend; describe it as evidence, not a
confirmed drift diagnosis. Algorithms/thresholds for these diagnostic queries
are versioned and recorded, and never alter interpretation.

Findings and next steps are deterministic rules over available evidence, not an
embedded language-model dependency. Each has a stable code, severity, evidence
references and rationale. Prioritize integrity problems, replay changes and
explicit corrections, then ambiguous trajectories/context and collateral
changes. Suggest a control experiment only with the actual control definition
and an explicit hypothesis; do not promise that it will improve the melody.

## Comparisons, listening and durable handoff

compare without overrides preserves today's saved/replay/automatic comparison.
--set contextCorrection=1 is shorthand for an explicit recipe, validated using
the shared control definitions; preserve zero and fractional override membership.
Candidates from --set or --recipe default to automatic inference with manual
edits, mutes and their protected boundaries removed. Saved corrections are used
only for evaluation. An explicit --apply-intent option enables an edited candidate
for replay/invariant experiments; its report cannot describe inherited corrections
as automatic recoveries. Recipes record this intent policy, and the flag must
agree with an explicitly supplied recipe policy or fail as contradictory.
A recipe records base values, key/timing/profile choices, interpretation version
and stage reuse/recompute policy. Default experiments rerun the shared pipeline
downstream of changed inputs; a controlled segment-only experiment explicitly
freezes saved or freshly computed full-context segments. Evaluation targets
never enter candidate inference. Ablations use exposed controls where possible;
unsupported omissions are rejected rather than introduced as hidden music modes.

Batch recipes contain named candidates and explicit sweep values. Reports show
recovered explicit corrections, remaining disagreements, all changed untouched
notes, mutes and segmentation correspondence. Never collapse this into one
accuracy score over unapproved notes. corpus uses a manifest identifying cases
and their approval scopes; it separates approved expectation regressions from
changes to unreviewed baselines. Effective-control equivalence across presets
is a verification recipe, with differing provenance retained in the report.

audition uses the same shared timed events for baseline and candidate. Require
--out, identical declared sound/octave/gain/timing treatment, a manifest of
source-time and playback-time changed passages, renderer identity, comparison
order and optional gap. Support an explicitly configured available renderer
(initially FluidSynth/SoundFont and FFmpeg orchestration is acceptable); missing
tools are actionable unavailable results, never silently installed. Record
SoundFont identity and whether glide handling is supported/enabled. Preserve
original audio as an optional listening reference. A preferred audition remains
a preference until explicit review identifies approved notes/ranges.

case export distinguishes an audio-backed detector reproduction from a
segment-only interpretation case. Include source/package and PCM hashes,
settings/versions/builds, full-context measured evidence, source correspondence,
explicit partial targets, approval scope and provenance. An audio-backed case
contains the full source audio, not only a selected crop. User-selected ranges
define evaluation scope. Cases can be checked by corpus after a code change.

An optional --investigation <directory> records requested queries, canonical
recipes, run identities, complete comparison data and explicit review records.
investigation export --out <directory> creates a portable manifest and referenced
artifacts, including recipes and evidence required to resume after cache loss.
The user chooses whether to bundle the original WAV; otherwise its hash is a
required external input, not a temporary path dependency. investigation inspect
summarizes work, remaining disagreements and review status; subsequent commands
can accept its named recipes. Existing recipes/results remain immutable; reruns
after a code fix append results with the new execution identity. No automatic
promotion of a candidate or baseline into approved truth.

Use investigation review <wav> --investigation <directory> --run <name>
--note <id> --axis pitch --expect <note-name> --status approved
--reviewer <identity> to record a pitch expectation against a specific run and
source range. An explicit --time selector can replace --note. The review record
includes the resolved source coverage, package/PCM and run identities, reviewer,
timestamp, axis, expected value and optional comment. Never assume a pitch review
also approves onset/duration or the complete transcription. Status preferred
records an audition preference without creating exact targets; unresolved records
an open question. Record whether approval was explicitly supplied by the user or
is an agent proposal; an agent proposal is not approved truth. Revisions append
records with an explicit supersedes reference, preserving prior evidence. Case
exports and corpus consume these versioned records; no hand-authored sidecar is
required to record a review.

## Disposable cache

Use an owner-private directory under os.tmpdir(), for example
/tmp/diapason-<uid>/cache/v1/, with --cache-dir for an alternate location and
--no-cache to bypass reads and writes. Cache failure must fall back to computation
with a diagnostic. No result may depend on the cache being present.

Read and SHA-256 hash the actual WAV bytes on every invocation. The full-file
hash identifies a package, since identical PCM can have different edits and
metadata. Store the validated PCM hash separately. A two-level layout can be
packages/<wav-sha256>/ for validated historical data and
runs/<execution-key>/ for current computations. Never trust a cache hit as a
substitute for validating this call's input or detecting input replacement.

Define a code/runtime identity from current production source-content fingerprint
(including uncommitted changes),
CLI computation/validation source fingerprint, lockfile/dependency identity,
Node/runtime identity and interpretation/pipeline versions. A complete run key
adds cache/report schema versions, full package hash, canonical resolved inputs
and recipe, including intent policy. Stage keys use the code/runtime identity
and their actual dependencies, not this recipe-specific run key. A git revision
or PCM hash alone is insufficient. Unknown code
identity bypasses current-computation reuse. Initially invalidate all computed
stages when the production fingerprint changes; conservative correctness is
preferable to a manually maintained source-dependency graph.

Within an execution, dependency keys allow frame reuse across control-only
experiments: PCM identity/sample rate, detector options and code/runtime identity
key acoustic frames; segments additionally include segmentation controls and
protected boundaries; interpretations include all effective controls, range,
key/tuning/harmony/timing inputs; edited output includes intent and playback.
Preset names are provenance, not musical algorithm inputs. Identical effective
values can share musical computations while preserving distinct override and
version evidence in verification results. Store numeric frames losslessly;
the existing Float64 pack/unpack representation can be shared after separating
it from IndexedDB-specific imports.

Each result records which stages were reused or recomputed and their keys.
Reused detector frames are allowed; claims of fresh detector execution require
a cache-bypassing run. Cached optional ffprobe results also depend on executable
identity; installed-tool availability is checked for this invocation.

Use atomic completed-entry publication, per-entry version/integrity validation
and safe concurrent writers; readers never consume partial files. Ignore and
recompute invalid entries. Do not store mutable input paths as identity or follow
untrusted cache links. Pruning is bounded by age/size and confined to this tool's
cache; proposed defaults are seven days idle and 1 GiB, with cache status/clear
available. Durable investigations never live under this pruning root.

## Implementation boundaries and delivery order

This is a multi-part feature. Plan vertical slices, each usable through the tool:

1. CLI libraries and report contract; compact inspect plus complete verification,
   text/Markdown/JSON, structured failures, cache and compatibility documentation.
2. Browsing saved/current notes, controls, stages and frame trajectories, followed
   by shared-decoder tracing and evidence-backed next steps.
3. Explicit recipes, single and batch comparisons, auditable stage reuse,
   similarities/patterns, corpus preservation and portable-equivalence checks.
4. Listening exports, durable cases and investigation handoff/resumption.

Do not mark the complete investigation workflow delivered after slice 1.
Keep Node filesystem/cache/CLI/rendering code under tools; shared calculation
and validation types remain usable by the app without importing CLI libraries.
The builder chooses exact file decomposition and library configuration, but
must avoid duplication/health baseline growth. README must describe implemented
behavior and limits on each feature branch, not advertise future commands.

## Validation and acceptance

Exercise the supplied Downloads WAV without committing it. Its PCM identity is
150d5d23618d70d9fd7f9e8544194a8607f357724317a455e45ef56ca7370f0a.
Confirm seven corrections at saved IDs 5, 7, 9, 11, 13, 14 and 25. The existing
whistle-moon fixture is segment-only, partially reviewed; it does not establish
audio-detector correctness or approval for every note. Never hardcode these
counts into findings rules.

Meaningful regressions cover all three formats including escaped names/paths,
structured invalid-input output, source non-mutation, complete bounded-query
pagination, historical missing controls, explicit zero/fractional values,
split/merge correspondence, hidden edits/mutes, numeric tolerances, MIDI event
versus byte differences, trace equivalence, missing optional renderers, and
cache invalidation for changed WAV metadata, source, settings, runtime and
dependencies. Test concurrent/corrupt cache entries and cache-disabled equality.
Test a durable export resuming after cache deletion, with mismatched audio
rejected and partial review retained. Use synthetic audio/registered fixtures
for committed automated tests; the Downloads WAV is an additional manual case.

The end-to-end acceptance walkthrough is: inspect the WAV in Markdown, follow a
suggested correction query, explain a note and inspect its frames/candidates,
compare explicit controls, list every collateral difference, check other cases,
export listening review and a scoped reproduction, then rerun after a code fix
and resume the investigation with an empty cache. All evidence queries stay
inside bin/diapason. Normal code edits and repository tests remain development
work. Run focused regressions and npm run check before implementation submission.
