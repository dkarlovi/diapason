# Single-file recording and melody package

Status: approved direction, with optional tune restoration clarified during planning;
implementation is not part of this document change.

Issue: [#12 — named-note feedback](https://github.com/dkarlovi/diapason/issues/12).
Supports later work on [#11 — repeated figures and tuning drift](https://github.com/dkarlovi/diapason/issues/11).

## Intent

A user records a whistle, adjusts the melody to what they intended, downloads one
WAV, and sends it to a developer or agent. That file contains the audio, current
melody, settings, edits, and sufficient evidence to explain the original result.
The developer runs `bin/diapason` to inspect it and compare fresh automatic
analysis against the saved melody. No separately downloaded logs or JSON are needed.

MIDI remains the project's musical deliverable. WAV becomes the portable recording
and feedback package while remaining an ordinary playable audio file.

This supersedes the capture-only export and import behavior in
`2026-10-26-tagged-wav-roundtrip-design.md`. It also replaces the browser diagnostic
export workflow and paired JSON/WAV developer replay interface.

## Agreed direction and alternatives

- **Chosen: structured metadata inside the existing tagged WAV.** Extend the
  existing RIFF container and reuse the logical tune and edit models. The audio
  dwarfs the metadata, so readability, completeness, and validation take priority
  over compression. The metadata does not need to use the packed tune codec.
- **Packed tune inside WAV:** reuses the MIDI/share wire encoding directly, but
  brings size-oriented limits and representation choices without a useful benefit
  here. Its current visible-note edit mapping also omits inactive edit intent.
- **Sidecars or a separate archive:** can carry the same information, but requires
  managing multiple files or introduces another export format. Neither improves
  the requested one-file, playable-audio workflow.

MIDI and share links retain their existing packed formats. This proposal changes
the recording package, not every portable representation.

## Scope

Include current applied melody settings, full pitch-edit intent, mutes, playback
instrument and octave, and the rendered musical result. Preserve inactive and
partially represented edits as well as visible edits.

Exclude undo/redo history, named versions, viewport, selection, theme, temporary
auditions, and external MIDI routing. This is a snapshot of the current recording,
not a backup of the entire library or editing session. This boundary is a proposed
design choice, carried forward from the initial suggestion.

Do not change detection algorithms, add automatic learning, introduce approval
controls for passages, import arbitrary audio formats, or alter existing reference
fixtures. Preserve the user-approved `whistle-intro/clean.mid` regression.

## User workflow

The editor retains Download MIDI and Download WAV. Remove Download log, Download
JSON, Copy log, and the diagnostic text area and clipboard fallback. Keep unrelated
recording actions and the musical Share workflow.

Download WAV exports the current applied state. Finish pending edit transactions
and flush persistence before taking the snapshot, using the same discipline as
MIDI export. Snapshot the recording, audio, frames, and processed result together
before asynchronous work. A navigation or concurrent edit must not mix states.
Export failure shows an actionable error and does not download a partial package.

An unapplied audition is not exported. During such an audition, disable both
downloads with a short explanation to apply or stop the preview first. Applied
settings remain exportable. Export must not silently apply a preview.

WAV remains unavailable for recordings containing only a portable tune and no
audio. MIDI/share remain their portable outputs. Do not synthesize audio merely
to create a recording package. Existing embed restrictions remain in place.

## Container and schema

Continue writing mono PCM16 `fmt ` and `data` chunks with exactly the samples used
for analysis. Keep RIFF sizing, chunk padding, `LIST/INFO`, and `acid` support.
Audio never contains rendered MIDI or pitch-corrected replacement audio.

Use a new version of the existing UTF-8 JSON `dpsn` schema (`schemaVersion: 2`,
`app: "diapason"`, `kind: "recording"`). No base64, gzip, binary tune packing, or
URL-size limits are required for this JSON. Define a public wire schema rather
than serializing an IndexedDB record indiscriminately.

The package contains these logical sections; precise property names are left to
the builder:

| Section            | Required information                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recording          | Original/source identity, current name, creation time, tempo, meter, downbeat, sound profile, resolved acoustic analysis options, capture calibration                              |
| Capture provenance | Original recording build, pipeline, browser, and available capture/output context; preserved across imports                                                                        |
| Export provenance  | Current export build, pipeline, timestamp, browser, and available output context; refreshed on each export                                                                         |
| Edit intent        | Versioned current `EditSnapshot` intent, including source ranges and IDs for every pitch edit, mute anchors, melody settings, and playback settings                                |
| Tune snapshot      | Structured logical equivalent of `PortableTune`: source segments, source coverage, automatic pitches, melody settings, effective knobs, active edits/mutes, and playback settings  |
| Result evidence    | Full-precision exported items with source ranges, automatic and effective notes, mute state, edit coverage, chosen key and alternatives, inferred harmony, and final logical notes |
| Acoustic evidence  | Full-precision time, frequency or null, clarity, and RMS for the pitch frames used by the editor                                                                                   |
| Audio identity     | PCM format, sample count, sample rate, timeline convention, and SHA-256 of the PCM `data` bytes                                                                                    |

The tune snapshot uses the structured logical result of `createPortableTune()`,
including its existing timing normalization, so the current `encodeTuneMidi()`
path can reproduce Download MIDI. Do not change MIDI timing or the MIDI/share
format in this work. Keep full-precision editor timings separately in result
evidence; do not claim that rounding can never affect a MIDI tick. Package limits
need not inherit link-oriented caps, although data passed into the existing MIDI
encoder must meet that encoder's supported constraints. Result evidence is a frozen observation,
not something a newer engine may regenerate and label as the original result.
Keep the exact user-facing MIDI bytes as a JSON byte array alongside the readable
tune and result evidence. This preserves the historical musical deliverable even
when a future interpreter changes how it renders the tune. Derived reports can
be generated from the saved evidence; duplicate human-readable logs are unnecessary. Required evidence is included automatically,
without a debug-export toggle.

Use seconds relative to the recording downbeat for source coverage and note
times. New exports normalize audio to downbeat zero. Validate redundant duration,
tempo, and sample information against their authoritative container or recording
values. Avoid silently choosing between contradictory copies.

Hash the PCM bytes, not the entire WAV: an embedded hash of the whole file would
be self-referential. This checks that metadata still refers to the accompanying
audio; it is not an authenticity guarantee for the metadata.

Preserve unknown compatible metadata fields on import and re-export. Regenerate
all known current-state fields rather than copying stale tune/result evidence
from the imported payload. Do not nest earlier complete packages on each export.
Byte-for-byte re-export is no longer promised; PCM sample identity is.

Validate schema versions, finite numbers, source ranges, note pitches, settings,
sample identity, and internal consistency before accepting a package. Use
documented practical resource limits to handle malformed files; metadata limits
must accommodate valid app recordings rather than mirror share-link limits.
Unsupported future schemas and damaged packages fail clearly without partial
imports or fallback to capture-only behavior.

## Import and compatibility

Keep the existing Library import picker, drop workflow, and preview popover.
For each schema-2 WAV, offer **Restore saved tune and edits** (selected by default)
or **Start fresh from audio**. Both use the same file; no separate MIDI/tune import
is needed. Starting fresh uses capture-time defaults and restores no melody
settings, edits, mutes, or playback settings from the saved tune. Keep the received
package as an imported reference in either mode, but do not report the intentional
fresh start as a replay mismatch. Schema-1 WAVs have only the fresh-start behavior.

When restoration is selected, schema-2 imports restore audio and full edit intent into an audio-backed recording;
do not convert them into fixed-note-only recordings. Detection controls must
continue to work, and hidden edits must recover when their coverage returns.
Store the received snapshot/evidence as the original imported reference, separate
from subsequent current analysis and edits.

With matching processing code, the restored roll, mutes, edit markers, playback
settings, and MIDI must reproduce the exported state. The package's generated
MIDI must agree with Download MIDI, including octave transposition, out-of-range
note filtering, instrument program, tempo, and meter. Logical pitch comparisons
remain separate from playback transposition.

With different code, importing still restores intent and analyzes with the current
engine. If the resulting melody differs, show a persistent recording-level notice
that the analysis differs from the saved result. Do not silently claim an exact
round trip. The imported original remains inspectable through the CLI, even when
the current browser cannot reproduce it. An interactive historical-engine viewer
is outside this scope. Build differences alone do not imply a musical mismatch.

For ID collisions, keep Open existing and add an explicit Import as copy choice.
Never overwrite local edits or automatically create duplicates. A copy receives a
new local ID while preserving source identity and provenance. Recheck collisions
when saving, including multiple selected files with the same ID.

Schema-1 tagged WAVs remain importable with their existing capture-only semantics.
The CLI can inspect their capture metadata, but `compare` reports the missing
saved baseline and exits 2. Fresh schema-1 analysis through the CLI is outside this
scope; importing and exporting through the app creates a current package.
Untagged/unsupported WAV imports
remain outside scope. Existing old JSON/WAV fixtures must remain usable by tests;
a developer-only legacy reader may remain where needed, but the new CLI does not
require a sidecar.

Audio software may strip unknown chunks when re-saving a WAV. Retain this known
limitation in the README.

## Developer CLI

`bin/diapason` is the ongoing investigation interface throughout the tuning
journey. A developer or agent should be able to return to the same WAV with
increasingly specific questions, examine the evidence, change analysis code, and
compare results again. Initial reports are entry points into this workflow;
generated JSON, MIDI, or external tools are useful outputs, not a required handoff
away from the CLI after the first report.

Provide an executable repository entry point, usable from any working directory:

```sh
bin/diapason inspect recording.wav
bin/diapason inspect recording.wav --json
bin/diapason compare recording.wav --out /tmp/diapason-comparison
```

Use the application's shared TypeScript analysis, interpretation, validation, and
MIDI modules. Do not implement a second detector or note renderer in the CLI.
Repository dependencies may be required; a separately distributed binary is not
required. Resolve project assets from the entry point, not the caller's directory.

`inspect` reads saved evidence without substituting fresh analysis. Default text
summarizes capture/export versions, audio identity, settings, quality, named notes,
automatic/effective differences, mutes, inactive edits, and comparison availability.
`--json` emits the complete normalized saved information and frames for tooling.

`compare` validates audio identity and runs these distinct comparisons:

1. **Saved result:** the exported melody and original evidence, left unchanged.
2. **Current replay with edits:** current acoustic analysis and interpretation with
   the saved applied settings, pitch edits, and mutes. Report differences from the
   saved frames, musical result, and available processing evidence.
3. **Fresh automatic result:** current analysis with the same settings but with
   manual pitch edits, edit-protected segmentation boundaries, and mutes removed.
   Compare this against the saved intended melody. This is the measure relevant to
   improving detection without requiring the user's corrections.

Compare source time coverage, not note index: segmentation can change. Report
pitch differences in semitones/cents where relevant, timing differences, missing
or extra notes, and splits/merges. Distinguish muted material and explicit pitch
corrections from untouched notes. A corrected note is feedback about intent;
untouched notes are not automatically approved ground truth, and a mute does not
by itself prove the audio is unvoiced. Report raw timing deltas; the builder may
choose and document matching tolerances without masking replay differences. Numeric evidence comparison allows an absolute
tolerance of `1e-9` to accommodate browser/Node floating-point rounding; object
property order is irrelevant. MIDI bytes are compared exactly. Include this
tolerance in the structured and human-readable comparison reports.

Write a human-readable comparison, structured JSON with sufficient stage/frame
detail to investigate differences, and MIDI for the saved result, current edited
replay, and fresh automatic result. Reports must label logical pitches versus
playback-transposed output consistently. Summarize results and output paths on
stdout. Generate verbose diagnostic text/JSON here rather than exposing separate
download options in the app.

Exit codes: 0 for successful inspection or an exact edited replay, 1 for an edited
replay mismatch, 2 for invalid input, usage errors, unsupported data, or comparison
without a saved baseline. An expected automatic-versus-edited difference alone
does not fail the command. Report unknown build identity honestly, including
development exports; matching numbers do not prove the same source code.

### Direction beyond the initial commands

[Follow-up #48](https://github.com/dkarlovi/diapason/issues/48) proposes default
verification metrics and import/audio/MIDI round-trip checks within this tool.

Future queries should support narrowing to a time range, bar/beat passage, note,
or edit source range, and choosing which evidence to examine: audio samples,
pitch frames, segmentation, key/harmony decisions, corrections, or final notes.
Examples of questions the tool should eventually help answer:

- What happens between 4 and 6 seconds, and which frames support this note?
- Why did this passage become two notes rather than one?
- Which source ranges were corrected, muted, or hidden by detection settings?
- How does the second occurrence of this figure differ from the first?
- What changes in this passage with a different gate, preset, or detector build?

These are directional examples, not additional commands required in this release.
Do not add a natural-language interpreter, interactive shell, server, query DSL,
or plugin framework for this work. Agents can formulate questions through ordinary
CLI arguments as focused capabilities are added.

The initial implementation must keep loading/validation, evidence access, replay,
comparison, and output formatting separate enough to extend those commands without
rebuilding the investigation pipeline. Preserve full-resolution evidence and
absolute source-time coordinates in machine-readable outputs. Distinguish saved
observations from current recomputation and later experimental results; reading
or comparing must not mutate the input WAV. Later zoom/filter operations should
select evidence from a full-context analysis by default, since analyzing a cropped
passage can change key, tuning, segmentation, and timing decisions. Explicit
cropped reanalysis, if added, must be identified as a different experiment.

## Implementation boundaries

Extend `wav-metadata.ts` and its validators, reuse `edit-state.ts`, and extract
shared pure snapshot/report functions where appropriate. Keep browser export and
import effects in hooks. Evolve the existing diagnostic/report/replay code rather
than retaining two competing evidence models. Remove obsolete browser log state,
clipboard code, actions, and tests. Retain useful diagnostic calculations behind
the CLI. Replace the documented paired replay command with `bin/diapason`.

Update README sections for WAV sharing, diagnostics, MIDI semantics, compatibility,
and limitations. Revise the older WAV design's status with a link to this spec.
Preserve the `/diapason/` base path, client-only operation, local persistence,
ordinary WAV playback, and existing MIDI/share formats.

## Acceptance and verification

- Export an edited audio recording with explicit key/preset overrides, pitch edits,
  mutes, an inactive edit, and nondefault playback settings. Import into a fresh
  library and recover its current state and full edit intent. Restoring detection
  coverage recovers the previously inactive edit.
- Under the same engine, saved notes, restored notes, CLI edited replay, and
  user-facing MIDI agree, including octave, instrument, tempo, and meter.
- Fresh automatic comparison genuinely removes edits and their boundary protection;
  a split/merge example is matched by source time rather than index.
- Export after a pending edit captures it consistently. Preview, navigation, and
  failure scenarios do not produce mixed or misleading snapshots.
- A newer/different pipeline can report a mismatch while preserving the received
  baseline. A build change with identical output is not a musical mismatch.
- Fresh-start import uses the same audio and capture defaults without restoring
  tune settings, edits, mutes, or playback settings; the received reference remains
  available and no replay-mismatch notice is shown for this intentional reset.
- Copy import preserves existing recordings and original provenance. Schema-1
  import still works. Invalid/future metadata and corrupted audio fail clearly.
- Re-export updates current state/export provenance, preserves compatible unknown
  fields and capture provenance, and keeps PCM bytes unchanged.
- Ordinary audio tools read the WAV; verify chunk layout, padding, and sample
  identity. CLI works outside the repository working directory and emits usable
  text, JSON, MIDI, and documented exit codes.
- Browser diagnostics actions are gone; MIDI, WAV, Share, and unrelated recording
  actions still work. Existing approved melody fixtures remain unchanged.
- Run focused behavioral/regression tests and `npm run check` before submission;
  do not grow committed Fallow duplication or health baselines.

## Left to the builder

Exact JSON field layout, practical resource limits, source-time matching algorithm
and documented tolerances, report filenames, CLI loading/build mechanics, and
notice/copy-import wording. These choices must preserve the behavior above and
should not introduce new export formats or user-facing debug controls.
