# Single-file Recording Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export one playable WAV containing audio, current tune, complete edit intent, and original analysis evidence; optionally restore the tune on import and inspect/compare the package with `bin/diapason`.

**Architecture:** Version the existing `dpsn` JSON metadata, keeping audio and original capture provenance intact. Shared pure package/comparison modules serve browser hooks and a repository CLI; the CLI replaces browser diagnostic exports. Import remains audio-backed, with independent choices for tune restoration and collision handling.

**CLI direction:** `bin/diapason` remains the investigation interface throughout
decoder tuning. Initial inspect/compare commands establish reusable evidence
access and replay; future focused questions about passages, notes, frames, and
settings should extend this tool. Detailed zoom/query commands are deferred, not
replaced by an expectation that agents switch to another tool after one report.

**Tech Stack:** React, strict TypeScript, Vite, IndexedDB, Web Crypto, Node 22+, Vitest, React Testing Library. Reuse installed dependencies.

**Spec:** [Single-file recording and melody package](../specs/2026-10-29-recording-package-design.md). Read both documents before implementing.

## Global Constraints

- “MIDI remains the project's musical deliverable.”
- “Audio never contains rendered MIDI or pitch-corrected replacement audio.”
- “No base64, gzip, binary tune packing, or URL-size limits are required for this JSON.”
- “Byte-for-byte re-export is no longer promised; PCM sample identity is.”
- “Preserve the user-approved `whistle-intro/clean.mid` regression.”
- “Preserve the `/diapason/` base path, client-only operation, local persistence, ordinary WAV playback, and existing MIDI/share formats.”
- Exclude history, named versions, temporary auditions, viewport, theme, and device routing. Preserve hidden edit intent.
- Restore the saved tune by default; offer a per-WAV fresh start without separately importing MIDI.
- Keep CLI loading, evidence access, analysis/comparison, and formatting separable; preserve full-resolution evidence and absolute source-time coordinates. Do not add a query language or interactive service now.
- Run `npm run check` before submission; do not grow committed Fallow baselines. Review/update README throughout the feature branch.
- Create an isolated workspace at execution time using the worktree skill. This plan does not authorize implementation now.

## Review Focus

1. Same-ID imports racing with another tab must never overwrite a recording (Task 3).
2. Changing recording or editing while export awaits persistence/hash must not mix snapshots (Task 5).
3. Malformed or internally contradictory metadata must fail even when fresh-start import is selected (Tasks 1–2).
4. Same-pitch adjacent notes, splits/merges, and muted passages must produce useful time-based comparisons (Task 4).
5. CLI use outside the repo, including paths containing spaces, must preserve build identity and output paths (Task 6).

## File structure and shared contracts

Retain `wav.ts`/`wav-reader.ts` as container primitives. Keep schema-1 types and reader
behavior in `wav-metadata.ts`; extract common validation only when needed. Add:

- `src/recording-package-types.ts`: explicit schema-2 wire types, discriminated schema union, import modes.
- `src/recording-package-validation.ts`: structural/resource/consistency checks.
- `src/recording-package.ts`: snapshot capture, schema-2 WAV serialization/read, audio-backed restoration.
- `src/recording-package-comparison.ts`: fresh replay, exact evidence differences, source-overlap comparisons.
- `src/recording-package-report.ts`: text/JSON report assembly from normalized package/comparison data.
- `src/recording-import-storage.ts`: collision-safe IndexedDB insertion using `add`, not `put`.
- `tools/diapason.mjs` and executable `bin/diapason`: argument/I/O wrapper and repo-root loading.

Use these names across tasks:

```ts
type TuneImportMode = "restore" | "fresh";
type ImportDisposition = "original" | "copy";
type ProcessingEvidence = Pick<
  ReturnType<typeof buildReportData>,
  "settings" | "analysis" | "stages" | "config" | "quality" | "notes"
>;
interface RecordingPackageV2 {
  app: "diapason";
  schemaVersion: 2;
  kind: "recording";
  recording: WavMetadataV1["recording"] & { sourceId: string };
  provenance: RecordingOrigin; // Original capture provenance, never refreshed.
  exported: { at: number; context: RecordingOrigin };
  audio: {
    format: "pcm16-mono";
    sampleCount: number;
    sampleRate: number;
    timelineOrigin: "recording-downbeat";
    sha256: string; // Hash only the data chunk.
  };
  intent: EditSnapshot;
  tune: PortableTune; // Existing canonical MIDI input, including timing normalization.
  midiBytes: number[]; // Historical MIDI deliverable; do not re-render saved.mid with new code.
  frames: Frame[];
  evidence: ProcessingEvidence; // Full-precision editor observations.
}
interface CapturedRecordingPackage {
  record: AudioRecording;
  pcm: Float32Array;
  frames: Frame[];
  intent: EditSnapshot;
  tune: PortableTune;
  evidence: ProcessingEvidence;
  context: ExportContext;
  exportedAt: number;
}
interface ReadRecordingPackage {
  metadata: WavMetadataV1 | RecordingPackageV2;
  pcm: Float32Array;
  sampleRate: number;
}
```

`WavMetadataV1` is the existing `WavMetadata`, renamed or aliased explicitly. Add
schema-2 to `RecordingImport.metadata` without weakening it to `any`. Extend imported
state with `tuneMode?: TuneImportMode` and `sourceId?: string`; absence means legacy
capture-only import. Retain original metadata once, not a chain of nested packages.
Do not serialize local `editHead`, `editHistory`, audio Blob, or imported wrapper.

## Task 1: Define and validate the structured package

**Files:** Create `src/recording-package-types.ts`, `src/recording-package-validation.ts`, `src/recording-package-validation.test.ts`; modify `src/wav-metadata.ts`, `src/db.ts`, `src/portable-tune.ts`, `src/tune-validation.ts` only as required to separate package validation from link caps.

**Interfaces:** Produce `validateRecordingPackage(value: unknown, sampleCount: number, sampleRate: number): RecordingPackageV2`, plus the contracts above. Preserve existing schema-1 exports/readers for legacy tests.

- [ ] Write failing tests named `accepts a complete structured package`, `rejects inconsistent audio and tune metadata`, and `rejects malformed frames and edit ranges`. Assert schema 2, JSON round-trip equality, integer MIDI pitches, finite frame values (frequency may be null), monotonic frame times, bounds on source coverage, valid intent, matching BPM/meter/name, and consistent sample count/rate/duration. Test invalid tune data independently of link-size caps.
- [ ] Run `npm test -- src/recording-package-validation.test.ts`; expect failures for the missing validator.
- [ ] Implement the explicit schema and validator. Reuse existing settings/edit validators. Validate known evidence shapes without requiring the current engine to reproduce historical output. Reuse wire model validation with separate resource-policy parameters instead of calling the link decoder. Use a documented 128 MiB metadata-byte ceiling before JSON parsing; derive frame/segment count bounds from the actual PCM sample count and resolved analysis hop (allowing edit-induced segment splits), rather than assuming capture has a fixed maximum duration or imposing arbitrary URL caps. Test a large valid recording against these limits.
- [ ] Add `rejects unsupported schemas without downgrading`, `rejects duplicate required chunks`, and boundary tests at the documented limits. Reject nonzero downbeat for schema 2; preserve schema-1 trimming behavior. Do not reject valid historical results merely because today's interpretation differs.
- [ ] Run the focused test plus `npm test -- src/wav-metadata.test.ts src/tune-codec.test.ts`. Expect all tests to pass; update no approved fixtures.
- [ ] Commit the schema and validators with a focused descriptive subject.

## Task 2: Capture, write, read, and restore recording packages

**Files:** Create `src/recording-package.ts`, `src/recording-package.test.ts`, `src/recording-package.integration.test.ts`; modify `src/wav-metadata.ts`, `src/wav-reader.ts`, `src/diagnostic-snapshot.ts` for shared primitives as needed. Reuse `src/edit-state.ts`, `src/pcm.ts`, and `src/editor-model.ts`.

**Interfaces:** Produce:

```ts
captureRecordingPackage(record: AudioRecording, pcm: Float32Array,
  frames: Frame[], context: ExportContext, exportedAt: number): CapturedRecordingPackage;
encodeRecordingPackage(snapshot: CapturedRecordingPackage): Promise<Blob>;
readRecordingPackage(bytes: ArrayBuffer): Promise<ReadRecordingPackage>;
restoreRecordingPackage(input: ReadRecordingPackage, fileName: string,
  mode: TuneImportMode): Promise<AudioRecording>;
```

- [ ] Write failing round-trip tests using real whistle fixture audio and an edited recording: assert preserved PCM, complete intent including inactive edits, full-precision evidence, canonical tune, immutable capture provenance, refreshed export provenance, INFO/acid fields, and no history/local save metadata. Assert mutation of source arrays/settings after capture cannot change the package.
- [ ] Run `npm test -- src/recording-package.test.ts src/recording-package.integration.test.ts`; expect missing API failures.
- [ ] Implement synchronous defensive capture before asynchronous hashing. Reuse `buildReportData()` to select evidence, retaining JSON-safe harmony arrays; use raw `Frame[]` for acoustic evidence and `createPortableTune()` for canonical MIDI input. Hash PCM16 `data` bytes using a shared helper, then encode schema-2 metadata and ordinary WAV chunks.
- [ ] Implement dual-schema reading and audio identity verification. Both import modes validate the entire package; fresh mode does not bypass validation. Restore intent with `applyEditSnapshot()` in restore mode; fresh mode uses `newRecordingMelody(capture.rmsGate)` and no saved playback/mutes/pitch edits. Both return audio-backed records and retain the received reference and selected mode.
- [ ] Add tests for fresh import, schema-1 import, changed audio/hash rejection, export→import→edit→re-export without stale known fields or recursively nested references, and preservation of unknown compatible fields. Verify metadata extension fields survive while known current fields are regenerated. Confirm restoring detection coverage reactivates a hidden edit.
- [ ] Run the new tests and `npm test -- src/wav.test.ts src/wav-metadata.test.ts src/wav-metadata.integration.test.ts`. Expect passes and identical PCM bytes. Compare `encodeTuneMidi(read.metadata.tune)` bytes against the existing Download MIDI path for the same snapshot, including nondefault octave/instrument and out-of-range pitches.
- [ ] Commit the package round trip.

## Task 3: Offer optional tune restoration and safe copy import

**Files:** Create `src/recording-import-storage.ts`, `src/recording-import-storage.test.ts`; modify `src/hooks/useRecordingImport.ts`, `src/hooks/useRecordingImport.test.tsx`, `src/components/RecordingImport.tsx`, `src/components/Library.tsx`, `src/components/Library.test.tsx`, and `README.md`.

**Interfaces:** Extend each WAV `ImportCandidate` with parsed `package?: ReadRecordingPackage`, `tuneMode?: TuneImportMode`, and `disposition?: ImportDisposition`. Produce `insertImportedRecording(record: Recording, disposition: ImportDisposition): Promise<Recording>` and hook `setCandidateOptions(index: number, options: { tuneMode?: TuneImportMode; disposition?: ImportDisposition }): void`. Existing MIDI/URL candidates retain their current behavior.

- [ ] Write failing hook/UI tests: a schema-2 candidate defaults to restore; switching to fresh imports unchanged audio without saved tune settings; choosing restore requires no MIDI file; schema 1 has no tune choice; collision defaults to Open existing and becomes importable only after explicit copy selection. Assert options are independent per file.
- [ ] Run `npm test -- src/hooks/useRecordingImport.test.tsx src/components/Library.test.tsx`; expect the new cases to fail.
- [ ] Add per-WAV **Restore saved tune and edits** / **Start fresh from audio** controls. Show **Import as copy** for collisions. Keep inspection read-only; allocate copy IDs at confirmation. Retain received reference in both modes. Keep existing MIDI/share URL imports and embeds working.
- [ ] Implement insert with one IndexedDB readwrite transaction and `objectStore.add()`. For original disposition, an ID collision must fail without overwriting; copies allocate a new ID and preserve source identity/provenance. Test a collision appearing after inspection, two same-ID files in one batch, and independent concurrent insert attempts. Preserve the hook's accurate partial-success reporting and retain an actionable retry path for failed rows.
- [ ] Update README with the import choice and collision behavior. Run import/storage/Library tests; expect restore/fresh/copy flows and existing MIDI import tests to pass.
- [ ] Commit optional restoration and safe import.

## Task 4: Compare saved evidence with edited and automatic replay

**Files:** Create `src/recording-package-comparison.ts`, `src/recording-package-comparison.test.ts`, `src/recording-package-report.ts`, `src/recording-package-report.test.ts`; modify `src/diagnostics.ts`, `src/diagnostics-replay.ts`, `src/diagnostics-validation.ts` only to share useful logic and preserve legacy tests.

**Interfaces:** Produce:

```ts
compareSavedMelody(saved: ProcessingEvidence,
  current: ProcessingEvidence): { matches: boolean; differences: MelodyDifference[] };
compareRecordingPackage(input: ReadRecordingPackage): Promise<PackageComparison>;
formatPackageInspection(input: ReadRecordingPackage): string;
formatPackageComparison(result: PackageComparison): string;
```

Define/export `MelodyDifference` and `PackageComparison` here. The latter contains
`status: "match" | "mismatch" | "incomplete"`, build identity comparison, saved and
current evidence, edited/automatic frames, source-time matches/differences, and
three `PortableTune` values for saved/edited/automatic MIDI when a baseline exists.
No baseline returns `incomplete`, never a fabricated saved tune.

- [ ] Write failing tests for same-engine exact replay, changed pitch frames, changed melody with the same build, different build with identical output, automatic-versus-edited differences without edited replay failure, and schema-1 incomplete comparison.
- [ ] Run `npm test -- src/recording-package-comparison.test.ts`; expect missing APIs to fail.
- [ ] Replay using shared `analyzeRecording()` and `processRecording()`. Restore saved intent for edited replay. For automatic replay remove `noteEdits` and `muted` before processing so boundary protection disappears; retain applied melody settings. Never feed frozen saved source segments into fresh audio analysis.
- [ ] Implement exact equality of normalized processing evidence/frames separately from musical comparison. `compareSavedMelody` compares saved/current item source coverage, automatic/effective pitches, start/duration, mute state, and final logical notes, excluding build/timestamps. Match passages by positive source-range overlap; keep all overlaps to identify splits/merges, and classify unmatched ranges as missing/extra. Report raw deltas. Use the shared documented `1e-9` absolute numerical tolerance for browser/Node floating-point differences, ignore object property order, and compare rendered MIDI bytes exactly. Adjacent half-open intervals touching only at an endpoint do not overlap.
- [ ] Add same-pitch adjacent-note, split, merge, silent-gap, mute, and hidden-edit tests. Assert a corrected pitch is labeled explicit intent, untouched notes unapproved, and mutes excluded from intended audible notes without treating them as proof of unvoiced audio. Verify `resetPitchEdit` behavior cannot accidentally retain protected boundaries in automatic replay.
- [ ] Build text reports from saved evidence for inspection, and from labeled saved/edited/automatic evidence for comparison. Include quality, key/harmony, inactive edits, logical versus transposed pitches, source coverage, and acoustic evidence differences. Do not reuse legacy report statements that incorrectly claim playback octave/instrument never affect user-facing MIDI.
- [ ] Keep evidence accessible as structured data before rendering or writing files, so later passage/note/frame queries can reuse the same loaded package and replay results. Test that formatting does not mutate evidence or discard precision/absolute source coordinates from JSON. Future zoom should filter full-context results by default, not silently crop and rerun the detector; no zoom command is required in this task.
- [ ] Run new tests plus existing diagnostics/replay/recording-pipeline fixture tests. Expect exact replay to match, split/merge reports to remain meaningful, and approved MIDI fixtures unchanged. Commit comparison/reporting; Task 5 consumes this API for import notices.

## Task 5: Switch browser exports and remove debug actions

**Files:** Modify `src/hooks/useEditorExports.ts`, `src/hooks/useEditor.ts`, `src/hooks/useEditorPlayback.test.tsx`, `src/components/EditorRecordingActions.tsx`, `src/components/EditorCanvas.tsx`, `src/components/Editor.tsx`, `src/components/editor-view-types.ts`, relevant editor integration tests, and `README.md`.

**Interfaces:** `useEditorExports.downloadWav(): Promise<void>` uses Tasks 1–2. Add `canExport: boolean` to export options/state, derived from readiness, pending operations, and unapplied audition state. Remove `downloadJson`, `downloadLog`, `copyLog`, `logRef`, `reportText`, and diagnostic copy state from hook/view contracts; retain ordinary export error notices.

- [ ] Write failing behavior tests asserting WAV contains schema 2 and the latest applied edit after flush; both downloads are disabled during unapplied auditions and handlers guard direct invocation. Applied previews remain exportable. Assert all three diagnostic actions and fallback textarea are absent while Versions, Share, Duplicate, and Delete still work.
- [ ] Run `npm test -- src/hooks/useEditorPlayback.test.tsx` and the editor component suite; expect new export/UI assertions to fail.
- [ ] Make WAV export await the existing `beforeExport` flush, then synchronously capture a coherent recording/audio/frame snapshot. Recheck recording identity and a generation token before download. Capture matching frames for that recording, never a stale closure from its predecessor. Wire disabled states and a concise Apply/Stop explanation without silently applying previews.
- [ ] Add deferred-promise tests for navigation during flush/hash, edit changes during hash, failed persistence, and failed hashing. Expect either a coherent captured state or no download; never mixed metadata/audio. Ensure MIDI-only recordings and embed restrictions stay unchanged.
- [ ] Use Task 4's musical comparison helper after analysis loads to derive a persistent notice only for restored imports whose current result differs from their saved evidence. Fresh imports and identical output with a changed build show no mismatch notice. Store original evidence unchanged. Add editor integration tests for these three cases; use the completed Task 4 APIs.
- [ ] Update README's WAV sharing and diagnostics UI description. Run the focused export and editor tests; expect passes. Remove obsolete browser diagnostic tests while retaining useful report/legacy fixture coverage.
- [ ] Commit the browser workflow change.

## Task 6: Provide the repository CLI

**Files:** Create executable `bin/diapason`, `tools/diapason.mjs`, `src/recording-package-cli.integration.test.ts`; modify `tools/replay-recording.mjs`, `package.json`, and `README.md`.

**Interfaces:** `inspect <wav> [--json]`; `compare <wav> --out <directory>`. Exit 0 for valid inspection/exact replay, 1 for edited replay mismatch, 2 for usage/invalid/unsupported input or missing baseline. Automatic-result differences alone do not fail.

- [ ] Write child-process integration tests asserting JSON inspection exposes saved values without reanalysis, same-engine comparison exits 0, altered saved observations yield exit 1 with reports, invalid input/usage/schema-1 comparison exit 2, and schema-1 inspection succeeds with incomplete status.
- [ ] Run `npm test -- src/recording-package-cli.integration.test.ts`; expect failure because the executable is absent.
- [ ] Implement a thin Node entry point using Vite's existing SSR loading approach in nondevelopment `replay` mode. Derive repository root/config from `import.meta.url`; set Vite `root` and config path explicitly so source hashing and git identity run from the repository, not caller cwd. Scope any cwd change to the isolated CLI process and resolve user input/output paths against the original cwd before it. Close Vite in `finally`; send errors to stderr and JSON alone to stdout for `inspect --json`.
- [ ] Write `comparison.txt`, `comparison.json`, `saved.mid`, `edited.mid`, and `automatic.mid` into the requested output directory after successful validation. Write `saved.mid` from the frozen MIDI bytes and use `encodeTuneMidi()` for current edited/automatic outputs; label playback transformations, and preserve mismatch reports even on exit 1. Reject output paths equal to the input and existing report targets rather than silently overwriting them. Preserve no partial success claim on write errors.
- [ ] Test invocation from a temporary cwd with spaces in input/output paths, all three readable MIDI outputs, clean process exit, and no output artifacts for invalid input. Ensure stdout reports generated paths accurately. Keep legacy replay code only if existing old fixtures still require it; remove the public paired-command documentation and optionally alias `debug:recording` to the new CLI.
- [ ] Verify repeated inspection/comparison leaves input WAV bytes unchanged and permits another comparison after analysis code changes without converting the recording into a separate intermediate format. Keep argument dispatch and filesystem I/O in the wrapper, with evidence selection/replay available through shared modules; do not build a generic command framework or future query commands now.
- [ ] Update README with dependencies, executable examples, comparison meaning, exit codes, schema-1 limits, and chunk-stripping caveat. Run CLI integration tests and commit the CLI.

## Task 7: Verify the complete feedback loop

**Files:** Extend `src/recording-package.integration.test.ts`, `src/components/Library.test.tsx`, relevant editor integration tests, and `README.md`; update this plan's checkboxes as work completes.

**Interfaces:** Exercise Tasks 1–6 without introducing another package/report model.

- [ ] Add one end-to-end regression through shared real modules: fixture audio → manual edit plus mute and hidden edit → package → restore/fresh imports → edited MIDI → CLI-style replay. Assert restored intent and saved MIDI equality, fresh absence of edits, immutable received reference, correct automatic differences, and unchanged original PCM/reference fixture files.
- [ ] Run the focused integration tests; expect passes. Verify user-facing flows in the browser: per-file import choices, collision copy, preview-disabled downloads, persistent genuine mismatch notice, no fresh-start mismatch notice, no browser debug controls, and usable mobile import popover. Capture screenshots of visible changes for a later PR.
- [ ] Generate a disposable package in `/tmp` and run `ffprobe` against it when available; otherwise use another installed independent WAV reader and record which tool confirmed mono PCM16 playback compatibility. Do not add a dependency only for this check.
- [ ] Run `npm run check`; expect typecheck, lint, formatting, duplication, coverage tests, audit, and production build to succeed. Resolve failures without increasing committed baselines. Confirm `origin/main` and `HEAD^` exist before interpreting Fallow failures.
- [ ] Review README against resulting behavior and remove obsolete capture-only/byte-identical re-export/paired-sidecar claims. Run `git diff --check` and inspect fixture changes; expect no whitespace errors or modified approved fixtures.
- [ ] Commit final regression/docs changes. Request whole-branch review before submission using the review skill. Report validation evidence and any remaining practical limits; do not deploy or merge as part of this plan.

## Execution notes

Implemented on branch `recording-package`. The shared validator accepts historical
preset evidence without resolving it against current defaults. Known current
fields are regenerated while compatible nested object extensions survive re-export.

The first real user package (`Fly me to the moon`, 16.959833 seconds, 111 BPM,
32 notes, 5 pitch edits) reproduced logical notes and MIDI exactly. Its pitch
steadiness differed between browser and Node by `3.552713678800501e-15`; regression
tests now distinguish harmless rounding from real evidence or MIDI changes.
The source file stays in the user's Downloads; reports are disposable `/tmp`
artifacts and the recording is not committed as an approved melody fixture.
