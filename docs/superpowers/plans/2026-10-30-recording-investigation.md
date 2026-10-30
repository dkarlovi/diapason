# Recording Investigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bin/diapason sufficient to verify, browse, explain, experiment with, listen to, preserve and revisit a tuning investigation without ad hoc analysis scripts.

**Architecture:** Focused Commander commands load application TypeScript through the existing Vite SSR entry point. Shared typed domain reports drive text, Markdown and JSON renderers; Node-only adapters handle disposable content-addressed caching, filesystem artifacts and external renderers. Every analysis retains full recording context, with explicit saved/replay/automatic views and source-range correspondence.

**Tech Stack:** React/TypeScript application's existing detector/interpretation/import/MIDI modules; Node ESM; Vite SSR; Vitest; Commander, Chalk, cli-table3, mdast-util-to-markdown, mdast-util-gfm-table and shell-quote as development dependencies.

**Spec:** [Approved design](../specs/2026-10-30-recording-investigation-design.md). Read both documents before execution; issue #48 and its linked investigation comment explain the motivating cases.

## Global Constraints

- All CLI libraries belong in devDependencies and must stay outside the browser import graph.
- Keep source WAV and browser IndexedDB unchanged. Only cache writes occur by default; generated reports, MIDI, listening files and cases require --out. An explicitly selected --investigation directory also permits append-only investigation writes.
- Preserve full-context analysis. Time/note selectors filter results after analysis; they never quietly crop the detector or decoder inputs.
- Same effective controls, input and interpretation version produce the same result regardless of preset identity.
- Distinguish user corrections, approved expectations, unreviewed preservation targets, and subjective listening preferences. Never infer approval from silence.
- Do not change tuning algorithms, add hidden musical controls, automatically modify recordings, install renderers, or claim to recover an exact intended tune.
- --format text|markdown|json is universal; --json aliases --format json. Text remains the default regardless of TTY. Markdown and JSON contain no ANSI escapes.
- Lists default to 20 rows; --offset/--limit paginate and --all explicitly returns all selected rows. inspect targets roughly 30 lines, at most three findings and three next steps.
- Absolute numeric tolerance is 1e-9; report maximum observed deltas and paths even below tolerance. MIDI bytes compare exactly.
- Cache defaults: owner-private os.tmpdir()/diapason-<uid>/cache/v1, seven days idle, 1 GiB. --cache-dir overrides location; --no-cache bypasses reads and writes.
- Preserve Node 22 support by selecting compatible library releases, or document the exact higher minimum in package.json and README before installing a release that requires it. Do not add a separate CLI compilation pipeline.
- No new duplication/health baseline growth. Update README for each shipped milestone. The Downloads WAV and screenshots must not be committed.
- This document is a plan, not permission to start implementation. Create an isolated branch/worktree at execution time, following the worktree skill.

## Review Focus

1. A recording name or path containing pipes, backticks, quotes, newlines or Unicode must remain readable and must never change a suggested command's arguments (Task 1).
2. Re-exported WAVs with identical PCM but changed corrections must not reuse package-specific conclusions, while control-only experiments may reuse acoustic frames (Task 4).
3. A saved correction overlapping split/merged candidate segments must not be scored by array index or counted recovered through a partial/ambiguous match (Tasks 5 and 9).
4. A valid older package missing a newly added control must use its historical default, preserving explicit zero/fractional overrides and unknown build identity (Tasks 2 and 11).
5. Audible A/B renders must match the actual MIDI timing, octave, instrument and filtering, including a changed note shifted from source time by quantization (Task 12).

---

## File and interface map

Keep the four milestones in one plan: they depend on the same report, view,
identity and recipe contracts. Each task is independently reviewable and ends
with a working command or an exercised shared boundary. Do not register commands
that only print a future-feature placeholder.

| Area                   | Files and responsibility                                                                                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry and CLI adapters | Existing bin/diapason and tools/diapason.mjs; new tools/diapason/commands.mjs, runtime.mjs, render.mjs, files.mjs; parsing, lifecycle, rendering and safe output publication                                                                  |
| Domain contract        | New src/investigation/types.ts, report.ts, api.ts; typed report envelope, findings, selectors and shared operations, with no Node imports                                                                                                     |
| Verification           | Existing recording-package reader/validator/comparison and diagnostics-validation; new src/investigation/verification.ts, imports.ts, events.ts, portable.ts                                                                                  |
| Cache                  | New tools/diapason/identity.mjs and cache.mjs; new src/frame-storage.ts extracted from analysis-cache.ts; stage identities and lossless frame serialization                                                                                   |
| Browsing               | New src/investigation/views.ts, notes.ts, controls.ts, stages.ts, frames.ts, explain.ts, findings.ts; joined evidence and focused queries                                                                                                     |
| Shared traces          | Existing src/melody/decode.ts, interpret.ts, src/recorder.ts and src/pitch.ts; new src/melody/decode-trace.ts and segmentation-trace.ts; trace the existing computations                                                                      |
| Experiments            | New src/investigation/recipe.ts, comparison.ts, patterns.ts, cases.ts; control recipes, comparisons, diagnostic patterns and reviewed case evaluation                                                                                         |
| Artifact adapters      | New tools/diapason/corpus.mjs, audition.mjs, cases.mjs, investigation.mjs; manifests, external processes and durable export                                                                                                                   |
| Tests                  | Shared _.test.ts beside each shared module; tools/diapason/_.test.mjs with @vitest-environment node; existing recording-package-cli.integration.test.ts expanded in place; new src/test-support/investigation.ts for synthetic packaged audio |

Use the following common names throughout the tasks:

- `Report<T>` in types.ts: `{ schemaVersion: 1, kind, input: InputIdentity | null, view: ViewName | null, execution: ExecutionIdentity | null, scope: QueryScope, overall: OverallResult, findings: Finding[], data: T, nextSteps: NextStep[] }`. Error reports use the same envelope and a structured error in data.
- `InputIdentity`: `{ wavSha256, pcmSha256: string | null, path, sampleRate: number | null, sampleCount: number | null }`. `ExecutionIdentity`: `{ codeRuntimeKey: string | null, runKey: string | null, build, pipelineVersion, interpretationVersion }`; preserve existing build types.
- `ViewName = "saved" | "replay" | "automatic"`; `OverallResult = "pass" | "incomplete" | "mismatch" | "fail"`; `CheckStatus = "pass" | "fail" | "mismatch" | "skipped"`.
- `QueryScope`: `{ total, returned, offset, limit, omitted }`; `NextStep`: `{ code, reason, argv: string[] }`. argv begins with `bin/diapason`; format/path/view/recipe are explicit.
- `EvidenceView` in views.ts: `{ name, runKey, frames: Frame[], evidence: ProcessingEvidence, tune: PortableTune, provenance: StageProvenance[] }`. schema-1 saved melody requests return an unavailable report, never a fabricated tune.
- `InvestigationContext` in api.ts: `{ input: ReadRecordingPackage, identity: InputIdentity, execution: ExecutionIdentity, stages: StageStore }`; `StageStore` exposes `read(key: string): Promise<unknown | undefined>` and `write(key: string, value: unknown): Promise<void>`. Each stage validates cached values before use.
- `StageProvenance`: `{ stage, key, disposition: "saved" | "reused" | "recomputed", inputs: string[] }`. Domain reports retain this even when compact renderers summarize it.
- Declare `ResolvedRecipe` in types.ts in Task 1 so later query signatures compile before the Task 8 resolver exists. It contains `{ schemaVersion: 1, name: string, digest: string, inputWavSha256: string, knobs: Knobs, overrides: Partial<Knobs>, key: KeyChoice, timing: { bpm: number, beatsPerBar: number }, range: { minMidi: number, maxMidi: number }, analysis: AnalysisSettings, play: PortableTune["play"], intent: "automatic" | "apply", segments: "recompute" | "saved" | "baseline", interpretationVersion: 1 | 2, savedBuild: RecordingOrigin["build"] }`. Import the existing application types; Task 8 defines resolution/validation, not another competing recipe type.
- Node `openInvestigation(path, options)` returns `{ context, api, close, assertUnchanged }`, where api contains Vite-loaded exports from src/investigation/api.ts. `assertUnchanged()` rehashes the input path after work, including failed operations. Paths resolve against the caller's original cwd; Vite root/config resolve from import.meta.url. Close Vite in finally.
- Renderers consume Report; `renderReport(report, { format, color, width }): string`. Keep domain findings separate from prose/table rendering; use library serializers/layout, not a generic homemade console framework.

## Milestone 1: Useful verification with a reusable CLI foundation

### Task 1: Ship compact inspection in three formats through CLI libraries

**Files:** Modify package.json/package-lock.json, README.md, tools/diapason.mjs, src/recording-package-cli.integration.test.ts. Create tools/diapason/{commands,runtime,render,files}.mjs, tools/diapason/render.test.mjs, src/investigation/{types,report,api}.ts, src/investigation/report.test.ts, src/test-support/investigation.ts.

**Interfaces:** Introduce the common contract above. `summarizePackage(input: ReadRecordingPackage, identity: InputIdentity): Report<PackageSummary>` reports saved facts and explicitly marks replay checks not yet available until Task 3. `publishOutputs(directory: string, entries: Record<string, Uint8Array | string>, inputPath: string): Promise<string[]>` preserves existing no-overwrite behavior. `exitCode(report: Report<unknown>): 0 | 1 | 2` distinguishes input/operation errors from historical mismatch.

**Primary regression:** `it("renders focused JSON without bulk package data", ...)`: `expect(report).toMatchObject({ schemaVersion: 1, kind: "inspect" }); expect(report.data).not.toHaveProperty("midiBytes");`. Suggested commands must already be registered: Task 1 can suggest raw inspect/help; add deeper suggestions as their commands ship.

- [x] **Step 1: Add failing renderer and child-process tests.** Assert inspect --format markdown includes the synthetic recording name, correction count and a next-step command, omits MIDI/frames arrays, and has no ANSI. Assert focused inspect --json has schemaVersion 1 and kind inspect; inspect --raw --json returns the original schema-2 package. Test conflicting formats, invalid selectors, unknown command and malformed JSON input as structured JSON exit-2 reports; text usage errors stay on stderr. Test shell-quote round trips for a path containing spaces, `'`, `$()`, backticks and newlines, and Markdown escaping for `|` in names. Normal output does not execute a command or write export artifacts.
- [x] **Step 2: Run `npm test -- src/investigation/report.test.ts tools/diapason/render.test.mjs src/recording-package-cli.integration.test.ts`.** Expect failures for missing report/format behavior; existing baseline tests establish preserved comparison exports.
- [x] **Step 3: Install locked dev dependencies and implement the entry/report adapters.** Use `npm install --save-dev commander chalk cli-table3 mdast-util-to-markdown mdast-util-gfm-table shell-quote` plus required type packages; verify engines and update the documented Node minimum if necessary. Commander owns validation/help/error lifecycle. Use mdast serialization for Markdown, shell-quote for displayed commands, cli-table3 for text tables and Chalk for styling with NO_COLOR/--color. Keep raw mode exclusive to inspect JSON. Move the existing comparison writer into files.mjs without changing its artifacts. Add a side-effect-free `runCli(argv, io)` entry for tests; import it from tools/diapason.mjs. No Vite startup for --help.
- [x] **Step 4: Rerun Step 2 and `npm run typecheck`; expect all pass.** Verify plain text, forced color, Markdown and JSON represent the same counts/findings; stdin is never required. Add README examples and the inspect JSON compatibility note.
- [x] **Step 5: Commit `Layered CLI reports`.** Stage only files owned by this task, including dependencies and README.

### Task 2: Give package failures field paths and historical semantics

**Files:** Modify src/recording-package-validation.ts, src/recording-package.ts, src/diagnostics-validation.ts, src/melody/knobs.ts and their existing tests. Create src/package-error.ts and src/package-error.test.ts.

**Interfaces:** `PackageError extends Error` carries `{ code: "malformed" | "unsupported" | "historical-default", path: string, check: string, context: { schemaVersion?: number, interpretationVersion?: number, build?: unknown }, trusted: false }`. Successful historical normalization is not an error: `historicalControls(value: Partial<Knobs>, version: 1 | 2): { values: Knobs, defaults: { key: keyof Knobs, value: number | string, reason: string }[] }` materializes only documented missing values. Preserve explicit overrides and original saved observations.

**Primary regression:** `it("resolves the historical context control without rewriting observations", ...)`: `expect(resolved.values.contextCorrection).toBe(0); expect(original).not.toHaveProperty("contextCorrection");`.

- [x] **Step 1: Write failing assertions** for wrong PCM hash path audio.sha256, missing required relationship fields, unsupported interpretation version, truncated/duplicate chunks and historical contextCorrection absence. A valid historical omission resolves to 0 with provenance; `{ contextCorrection: 0 }` retains override membership, and 0.35 remains 0.35. A malformed value fails rather than receiving a default. Unknown saved build stays unknown. Assertions target diagnostic codes/paths, not the old generic message.
- [x] **Step 2: Run `npm test -- src/package-error.test.ts src/recording-package.test.ts src/recording-package-comparison.test.ts src/portable-tune.test.ts`; expect new diagnostic assertions to fail.**
- [x] **Step 3: Implement structured checks in existing validators/readers.** Replace anonymous boolean groups with named checks at validation boundaries; safely include available historical header context as untrusted. Reuse version-aware historical controls in replay instead of mutating package JSON or using current preset defaults. Preserve all integrity checks; update legacy consumers to read the Error message as before.
- [x] **Step 4: Rerun Step 2 and the CLI integration test; expect pass.** A JSON error still has exactly one stdout document; invalid context cannot enter analysis.
- [x] **Step 5: Commit `Explain package validation failures`.**

### Task 3: Run all default verification checks and explain their results

**Files:** Create src/investigation/{verification,imports,events}.ts and corresponding tests; modify src/recording-package-comparison.ts, src/diagnostics-validation.ts, src/tune-midi.ts, src/investigation/api.ts, tools/diapason/{commands,runtime}.mjs, README.md and CLI tests.

**Interfaces:** `verifyPackage(context: InvestigationContext, options: { portable: boolean }): Promise<Report<VerificationData>>`; `compareValues(expected: unknown, actual: unknown, path: string): { firstDifference: string | null, maxNumericDelta: { path: string, absolute: number } | null, differences: ValueDifference[] }` walks all fields using 1e-9. `tunePlaybackEvents(tune: PortableTune): { notes: NoteEvent[], events: MidiEvent[], bpm: number, beatsPerBar: number, instrument: string, octave: number }` is shared by the actual MIDI writer and verification, eliminating the current inline playback transformation in tune-midi.ts. Node ffprobe adapter uses execFile argv, with executable/version availability checked each invocation.

**Primary regression:** `it("reports tolerated numerical drift without a replay mismatch", ...)`: `expect(delta.firstDifference).toBeNull(); expect(delta.maxNumericDelta?.absolute).toBe(3.552713678800501e-15);`.

- [x] **Step 1: Write failing verification tests.** Synthetic package: valid/edited replay, MIDI bytes, musical events, restore import, fresh import, PCM preservation and non-mutation pass independently. Change only saved frame RMS: replay mismatches while PCM integrity passes. Change build identity only: identity differs without automatically asserting musical mismatch. A 3.552713678800501e-15 delta passes and is reported; a 2e-9 delta mismatches at its path. Logical pitches versus octave-transformed/filtered events remain distinct. Active/hidden/partial edits and mutes survive restore; fresh clears them and retains received reference. Schema 1 is incomplete with explicit skips. Missing ffprobe alone does not downgrade overall pass.
- [x] **Step 2: Run `npm test -- src/investigation/verification.test.ts src/investigation/imports.test.ts src/investigation/events.test.ts src/recording-package-comparison.test.ts src/tune-midi.test.ts`; expect new checks to fail.**
- [x] **Step 3: Implement shared verification and wire inspect/verify.** Keep historical data immutable, compare current edited replay separately from fresh automatic inference, and avoid early exit after the first valid historical mismatch. Container/integrity failure stops dependent checks with reasons. Restore/fresh use restoreRecordingPackage in memory; PCM uses shared WAV encode/decode. Call shared MIDI/export functions rather than test utilities. Overall precedence: fail > mismatch > incomplete > pass; fail/usage exit 2, replay/approved-expectation mismatch exit 1, normal queries/incomplete exit 0. Runtime verifies input identity after computation in finally. Default inspect now runs all applicable checks and renders grouped results; verify exposes their details. Preserve compare --out outputs and allow compare without --out to report read-only results.
- [x] **Step 4: Run Step 2 plus `npm test -- src/recording-package-cli.integration.test.ts`; expect pass.** Test independent ffprobe absent/pass/fail adapters without making it a test dependency. Inspect small fixtures in all three formats and confirm no default artifacts or IndexedDB use. Update README's check meanings, exits and limitations.
- [x] **Step 5: Commit `Verify recording packages by default`.**

### Task 4: Cache computations safely across invocations and recipes

**Files:** Create tools/diapason/{identity,cache}.mjs and *.test.mjs, src/frame-storage.ts and src/frame-storage.test.ts; modify src/analysis-cache.ts, src/analysis-runner.ts, tools/diapason/runtime.mjs, src/investigation/{types,api,verification}.ts and CLI tests.

**Interfaces:** Node `codeRuntimeIdentity(root): Promise<string | null>` hashes production src TS/TSX, CLI computation/validation .mjs files, lockfile, runtime and pipeline versions. `runKey(identity, input, resolvedRecipe): string`; `stageKey(identity, stage, dependencies): string`. `createStageStore({ directory, enabled, maxBytes: 1073741824, maxIdleMs: 604800000 }): StageStore`. Extract existing `packFrames(frames: Frame[]): Float64Array<ArrayBuffer>` and `unpackFrames(packed: Float64Array): Frame[]` unchanged into frame-storage.ts; retain re-exports if needed for compatibility.

**Primary regression:** `it("shares frames across controls without sharing edited conclusions", ...)`: `expect(first.frameKey).toBe(second.frameKey); expect(first.runKey).not.toBe(second.runKey); expect(warm.evidence).toEqual(cold.evidence);`.

- [x] **Step 1: Add failing tests** showing warm verify returns identical domain evidence, hashes the actual input every call, and reports reused stages. Same PCM/different package corrections must produce distinct run keys and findings; different control-only recipes share frame keys. Changed uncommitted source, CLI code, lockfile, runtime, detector settings and intent invalidate their dependents. Unknown identity bypasses reuse. Corrupt/truncated entries, concurrent writers, unwritable cache and eviction fall back without failing verification. --no-cache creates no entries. A symlink inside cache cannot cause writes/pruning outside its owned root.
- [x] **Step 2: Run `npm test -- tools/diapason/identity.test.mjs tools/diapason/cache.test.mjs src/frame-storage.test.ts src/analysis-cache.test.ts`; expect new cache tests to fail.**
- [x] **Step 3: Implement content-addressed stage storage and cache commands.** Hash current WAV bytes independently of PCM; validate package/container per invocation. Serialize frames losslessly and validate cached type/schema/key/checksum before use. Publish complete entries atomically, tolerate equivalent concurrent writers and prune only tool-owned entries. Frame keys contain code/runtime identity, PCM/rate and detector options, never full recipe/package identity; segment keys add segmentation controls/protected boundaries; interpretation keys add effective inputs; edited/tune keys add intent/playback. Attach provenance and distinguish cache reuse from fresh detector execution. --no-cache bypasses reads/writes and diagnostics stay on stderr. cache status/clear take an optional WAV scope and honor --cache-dir; they never touch durable investigations.
- [x] **Step 4: Rerun Step 2 plus verification/CLI integration tests; expect pass.** Compare cold/warm/no-cache reports excluding execution disposition/timing only. Update README cache defaults, privacy and disable/clear commands.
- [x] **Step 5: Commit `Cache investigation stages`.**

## Milestone 2: Browse evidence and explain decisions

### Task 5: Browse joined notes, controls and stage correspondence

**Files:** Create src/investigation/{views,notes,controls,stages}.ts and matching tests; modify api.ts, report.ts, tools/diapason/commands.mjs, CLI tests and README.md.

**Interfaces:** `getView(context: InvestigationContext, name: ViewName, recipe?: ResolvedRecipe): Promise<EvidenceView>`; initially reject nonempty recipe until Task 8. `queryNotes(view, query: NoteQuery): Report<NotePage>`; `queryControls(context, view): Report<ControlPage>`; `queryStages(saved: EvidenceView, candidate: EvidenceView, query: SourceSelector): Report<StagePage>`. `SourceSelector = { note?: number, time?: { start: number, end: number } }`; mutually exclusive note/time. NoteQuery adds corrected/muted/changed filters, similarity seed/radius and pagination. Reuse matchSourceItems instead of positional joins.

**Primary regression:** `it("returns complete correspondence for a split saved note", ...)`: `expect(match.kind).toBe("split"); expect(match.currentIndices).toEqual([0, 1]); expect(allRows).toEqual([...page1, ...page2]);`.

- [x] **Step 1: Write failing tests** for note IDs/source ranges and joined measured/tuning/nearest/decoded/final labels, explicit edits/mute coverage, complete pagination, zero-note input and schema-1 unavailable melody. Similarity returns continuous pitch distances with the specified cents radius. A saved note split into two candidate segments returns both, a merge is explicit, and missing/extra notes are retained. Control rows show definition range/step, saved override membership, historical default, preset-supplied default, effective saved/current values and interpretation version. Source stages identify the first differing stage with no array-index assumption.
- [x] **Step 2: Run `npm test -- src/investigation/views.test.ts src/investigation/notes.test.ts src/investigation/controls.test.ts src/investigation/stages.test.ts`; expect missing-query failures.**
- [x] **Step 3: Implement notes, controls and stages commands.** Default view saved; replay/current computation only when requested. Validate finite absolute time ranges and selectors; out-of-range IDs produce a useful unavailable/usage result. Return counts and continuation argv in all formats. Do not silently infer an intended pitch for an untouched note. Permit --all and prohibit raw-package output through focused queries. Expose controls --all for the full definitions list.
- [x] **Step 4: Rerun Step 2 and CLI integration tests; expect pass.** Compare page concatenation against --all and assert no repeated/omitted rows. Update README with browsing examples and view semantics.
- [x] **Step 5: Commit `Browse recording evidence`.**

### Task 6: Inspect trajectories and trace frame contributions

**Files:** Create src/investigation/frames.ts, src/investigation/explain.ts and tests, src/melody/segmentation-trace.ts and tests; modify src/melody/decode.ts, src/recorder.ts, src/pitch.ts, api.ts and commands.mjs.

**Interfaces:** `frameTrajectory(view: EvidenceView, selector: SourceSelector, options: { bins: number }): Report<TrajectoryData>`; `explainNote(context, view, selector): Promise<Report<NoteExplanation>>`. `TraceOptions` contains optional segmentation/detector observer callbacks. Segmentation traces record source frames, voiced/gate decisions, smoothed values, attack/release trim membership and actual representative-pitch inputs. Detector traces distinguish rejected reasons only where the detector currently has evidence; do not expand historical package schemas just to fill them.

**Primary regression:** `it("keeps empty trajectory bins explicit and finite", ...)`: `expect(bins).toHaveLength(8); expect(bins[3]).toMatchObject({ status: "no-data", voiced: 0 }); expect(traced.segments).toEqual(untraced.segments);`.

- [ ] **Step 1: Add failing tests** with sustained, rising, attack/release-dominated and dropout frames. Eight bins return eight statuses; an empty bin is `{ status: "no-data", voiced: 0 }` without NaN/Infinity or unexplained null numbers. Representative pitch equals the shared trimmed-median output. Historical missing detector reasons are unavailable; fresh trace reports real rejection decisions. Selecting one note retains its full-context segmentation and neighboring short segments; trace on/off has identical frames, segments and notes.
- [ ] **Step 2: Run `npm test -- src/investigation/frames.test.ts src/investigation/explain.test.ts src/melody/segmentation-trace.test.ts src/melody/decode.test.ts`; expect trajectory/trace tests to fail.**
- [ ] **Step 3: Instrument shared detector/segment calculations with opt-in observers.** Keep default execution unchanged and avoid duplicated pitch/gate/trim formulas in query modules. frames defaults to eight equal source-time bins for a selected note/range, --raw-frames returns paginated original frames. explain presents source/continuous pitch/tuning/labels/control/chord context and trajectory with explicit unavailable historical details. Replaying a trace recomputes required stages if an untraced cache entry lacks them; report that disposition.
- [ ] **Step 4: Rerun Step 2 plus recorder/pitch tests; expect pass.** CLI tests prove a narrow time request equals filtering the full-context result and does not reanalyze cropped PCM. Update README with frame bins and trace limitations.
- [ ] **Step 5: Commit `Explain local pitch evidence`.**

### Task 7: Explain decoder candidates and guide the next query

**Files:** Create src/melody/decode-trace.ts, src/melody/decode-trace.test.ts, src/investigation/findings.ts and tests; modify src/melody/decode.ts, src/melody/interpret.ts, explain.ts, verification.ts, api.ts and CLI tests.

**Interfaces:** `decodeWithTrace(segments: Segment[], knobs: Knobs, context: PitchContext, request: { index: number, alternativeMidi?: number }): { notes: NoteEvent[], trace: DecoderTrace }` shares the decoder's scoring/transition/postprocessing path. `DecoderTrace` includes eligibility/rejection, component scores, predecessor costs, selected complete path, constrained alternative complete-path margin and post-decoder changes. `buildFindings(reportInputs: FindingInputs): Finding[]`; `suggestNextSteps(findings: Finding[], request: RequestIdentity): NextStep[]` use deterministic rules with stable codes and evidence paths.

**Primary regression:** `it("explains a global path choice without substituting local emission margin", ...)`: `expect(traced.notes).toEqual(untraced); expect(trace.pathMargin).toBeCloseTo(exhaustiveMargin, 12); expect(trace.pathMargin).not.toBe(trace.emissionMargin);`.

- [ ] **Step 1: Write failing tests** where locally best emission loses globally, an alternative is outside candidate reach, an intended label is in the minor scale, and a post-decoder chord correction changes the label. Assert the reported global margin equals an exhaustive short-sequence path enumeration; unavailable historical paths are never presented as known decisions. Trace on/off results are exactly equal on all existing melody fixtures. Findings prioritize integrity/replay issues before corrections and provide at most three input-specific runnable steps in inspect.
- [ ] **Step 2: Run `npm test -- src/melody/decode-trace.test.ts src/investigation/findings.test.ts src/investigation/explain.test.ts src/melody/interpret.test.ts`; expect new trace tests to fail.**
- [ ] **Step 3: Extract reusable scoring/DP operations while preserving arithmetic and tie order.** Collect terms at their actual computation sites. For an eligible alternative constrain the selected segment label and solve the complete recording path using the same operations; local emission margins get a different name. Explain current replay with saved correspondence and add --against <note-name> for an explicit alternative. Suggest trajectory/similarity/stage/control queries only when their evidence or missing evidence warrants it; never assert that an experiment will repair the tune.
- [ ] **Step 4: Rerun Step 2 plus decode/context-correction tests; expect pass.** Compare fixture events before/after instrumentation using existing references, without regenerating approved fixtures. Update README's explanation examples.
- [ ] **Step 5: Commit `Explain decoder decisions`.**

## Milestone 3: Reproduce experiments and assess collateral changes

### Task 8: Resolve auditable control recipes through the shared pipeline

**Files:** Create src/investigation/recipe.ts and recipe.test.ts; modify views.ts, api.ts, controls.ts, commands.mjs and runtime.mjs; create tools/diapason/recipe.test.mjs.

**Interfaces:** `resolveRecipe(input: ReadRecordingPackage, recipe: unknown, overrides: string[], applyIntent: boolean | undefined): ResolvedRecipe` fails on contradictions. Schema 1 recipe: `{ schemaVersion: 1, name, base: "saved", controls?: Partial<Knobs>, key?: KeyChoice, timing?: { bpm, beatsPerBar }, analysis?: AnalysisSettings, intent?: "automatic" | "apply", segments?: "recompute" | "saved" | "baseline", interpretationVersion?: 1 | 2 }`. ResolvedRecipe retains canonical effective values, supplied override membership, input/build/version identities and stage policy. Batch schema wraps named recipes with optional explicit-value sweeps; expand to a finite list before execution.

**Primary regression:** `it("preserves explicit zero while defaulting to automatic inference", ...)`: `expect(recipe.intent).toBe("automatic"); expect(recipe.overrides).toHaveProperty("contextCorrection", 0); expect(automaticRecord.noteEdits).toBeUndefined();`.

- [ ] **Step 1: Add failing tests** for --set contextCorrection=1 and explicit 0/0.35, unknown controls, invalid finite ranges, conflicting --apply-intent/recipe intent, unsupported historical semantics, duplicate candidate names and empty/oversized batches. Default candidate strips note edits/mutes/protected boundaries; apply mode retains them but cannot report automatic recovery. A frozen-segments experiment rejects changed detector/segmentation inputs that contradict the freeze. Equivalent values under different preset recipes yield identical music with distinct provenance.
- [ ] **Step 2: Run `npm test -- src/investigation/recipe.test.ts tools/diapason/recipe.test.mjs`; expect missing-recipe failures.**
- [ ] **Step 3: Implement recipe validation, canonicalization and getView integration.** --recipe/--set work with compare, explain, frames, notes and stages; attach the recipe identity to suggestions. No edit targets enter inference. Default recipes recompute downstream stages from changed inputs; segment-only mode explicitly freezes full-context evidence and reports its limitation. Add finite sweep expansion with a documented default maximum of 100 candidates, rejecting excess before work. Preserve zero/fractional overrides independently of musical computation cache reuse.
- [ ] **Step 4: Rerun Step 2 and view/cache tests; expect pass.** Assert the same recipe produces the same run/evidence after cache deletion. Update README recipe schema and inference/evaluation distinction.
- [ ] **Step 5: Commit `Reproduce interpretation recipes`.**

### Task 9: Compare single candidates and batches without hiding trade-offs

**Files:** Create src/investigation/comparison.ts and comparison.test.ts; modify existing recording-package-comparison.ts, events.ts, api.ts, commands.mjs, render.mjs, files.mjs and CLI tests.

**Interfaces:** `compareRecipe(context: InvestigationContext, recipe: ResolvedRecipe): Promise<Report<CandidateComparison>>`; `compareBatch(context, recipes: ResolvedRecipe[]): Promise<Report<BatchComparison>>`. CandidateComparison contains complete source correspondence, explicit-target outcomes, remaining disagreement, untouched-note changes, mute/timing/structural changes, event and byte differences, and StageProvenance. `TargetOutcome = "recovered" | "different" | "partial" | "ambiguous" | "missing"`.

**Primary regression:** `it("reports recovery and collateral changes independently", ...)`: `expect(result.recovered).toHaveLength(1); expect(result.collateral).toHaveLength(1); expect(result.targets[1].outcome).toBe("partial");`.

- [ ] **Step 1: Write failing tests** for recovery plus one collateral change, split/merge/missing/extra notes, mutes, unchanged pitches with changed timing, and equal musical events with different portable metadata/MIDI bytes. A split is recovered only if every corresponding part fully covers the target range and satisfies its approved axis; otherwise partial/ambiguous. A merge spanning contradictory targets is ambiguous. Positionally shifted arrays never change evaluation. An inherited manual edit is not an automatic recovery. All differences survive pagination/export.
- [ ] **Step 2: Run `npm test -- src/investigation/comparison.test.ts src/recording-package-comparison.test.ts src/recording-package-cli.integration.test.ts`; expect new candidate tests to fail.**
- [ ] **Step 3: Implement compare/read-only, --set, --recipe and --batch flows.** Keep legacy compare --out files and add candidate-specific names/manifest without overwriting. Batch summary presents recovered/remaining targets and collateral counts per candidate, with commands retrieving complete rows; never score unapproved notes as correctness. A candidate with recovery disagreements is a successful query exit 0 unless it violates an explicitly approved regression expectation; edited replay mismatch retains exit 1. Output directories receive full unpaginated result data even when console output is bounded.
- [ ] **Step 4: Rerun Step 2 and recipe/event tests; expect pass.** Exporting does not change the report's numeric data, input bytes or candidate inference. Update README with single, sweep and controlled-segment examples.
- [ ] **Step 5: Commit `Compare tuning experiments`.**

### Task 10: Find similar passages and report cautious tuning trends

**Files:** Create src/investigation/patterns.ts and patterns.test.ts; extend notes.ts/notes.test.ts, findings.ts, api.ts and commands.mjs.

**Interfaces:** `queryPatterns(view: EvidenceView, options: PatternOptions): Report<PatternData>`. Version 1 defaults: at least three notes per figure; compare interval sequences across nonoverlapping windows, allow constant transposition, use <=35 cents RMS residual, report duration ratios and source ranges separately; tuning bins default to 2 seconds with >=5 voiced frames and >=2 segments for a supported estimate. These are explicit diagnostic options/identities, not interpretation knobs. Expose --min-notes, --max-cents and --window-seconds to override diagnostic settings.

**Primary regression:** `it("finds transposed figures while withholding unsupported drift claims", ...)`: `expect(match.transpositionSemitones).toBe(2); expect(emptyWindow.status).toBe("no-data"); expect(report.findings.some(f => f.code === "tuning.pitch-mix-confound")).toBe(true);`.

- [ ] **Step 1: Add failing tests** for repeated and constant-transposed synthetic figures, nonmatching noisy figures, repeated pitches that are acoustically similar without matching a figure, silent windows and too little evidence. Empty windows return no-data. Tuning reports circular pitch-class residual statistics, sample counts and spread; a change in pitch mix produces a confounding warning rather than confirmed drift.
- [ ] **Step 2: Run `npm test -- src/investigation/patterns.test.ts src/investigation/notes.test.ts`; expect missing-pattern failures.**
- [ ] **Step 3: Implement deterministic diagnostic queries over full-context views.** Reuse continuous measured pitches and shared tuning calculations; record diagnostic version/options. Return evidence and uncertainty, not correction suggestions detached from controls. Large searches are bounded by explicit --min-notes/window settings and paginated matches. Add next-step links from relevant explain findings.
- [ ] **Step 4: Rerun Step 2 and CLI tests; expect pass.** Show that querying patterns never modifies underlying interpretation or note outputs. Update README with limitations and diagnostic defaults.
- [ ] **Step 5: Commit `Browse related musical evidence`.**

### Task 11: Check reviewed cases and portable interpretation invariants

**Files:** Create src/investigation/{cases,portable}.ts and tests, tools/diapason/corpus.mjs and corpus.test.mjs, src/fixtures/investigation-corpus.json; modify api.ts, commands.mjs and existing portable-tune/tune-midi tests as needed.

**Interfaces:** `evaluateCase(input: RegressionCase, recipe: ResolvedRecipe): Promise<Report<CaseEvaluation>>`; `verifyPortable(context: InvestigationContext, recipes: ResolvedRecipe[]): Promise<Report<PortableVerification>>`; `runCorpus(manifestPath: string, recipe): Promise<Report<CorpusData>>`. RegressionCase is a discriminated schema-1 audio-backed or segment-only manifest with content identities, full-context evidence, version/control provenance and axis-scoped targets/review records. Node adapters load bytes and pass decoded/shared inputs; shared case logic performs no filesystem reads.

**Primary regression:** `it("preserves portable fractional overrides without upgrading unreviewed targets", ...)`: `expect(restored.overrides.contextCorrection).toBe(0.35); expect(evaluation.preservationChanges).toHaveLength(1); expect(evaluation.approvedRegressions).toHaveLength(0);`.

- [ ] **Step 1: Add failing tests** distinguishing approved intro pitch/timing expectations, preferred-but-unapproved whistle-regression baseline, and partially reviewed whistle-moon segment-only evidence. An unchanged unreviewed baseline is preservation, not correctness. Approved regressions exit 1; missing required case audio/invalid identity exits 2. Share-codec, MIDI and WAV round trips retain interpretation version, exact 0/fractional overrides, edits/mutes, effective controls and musical events under equivalent preset recipes. Unknown builds remain unknown.
- [ ] **Step 2: Run `npm test -- src/investigation/cases.test.ts src/investigation/portable.test.ts tools/diapason/corpus.test.mjs src/portable-tune.test.ts src/tune-midi.test.ts`; expect case/portable-query failures.**
- [ ] **Step 3: Implement corpus and verify --portable.** Populate the registry from existing fixture manifests without changing original fixture bytes or upgrading prose preferences to exact approved notes. Move production-use fixture reading out of src/test-support; do not import test helpers into the CLI. Use encodeTune/decodeTune for the shared payload boundary used by sharing, encodeTuneMidi/decodeTuneMidi and package encode/read/restore for MIDI/WAV. Include base64url transport in share-codec checks. Expose corpus per-case differences and stages, with the same candidate recipe and scope as compare.
- [ ] **Step 4: Rerun Step 2 plus portable-tune integration tests; expect pass.** Ensure a segment-only case cannot claim detector coverage and an approved pitch expectation does not approve timing. Update README corpus provenance and portable-check examples.
- [ ] **Step 5: Commit `Check corpus and portable interpretations`.**

## Milestone 4: Listen, preserve reviewed evidence and resume

### Task 12: Export reproducible listening comparisons

**Files:** Create tools/diapason/audition.mjs and audition.test.mjs; extend events.ts/events.test.ts, commands.mjs, files.mjs and README.md.

**Interfaces:** `renderAudition({ baseline: EvidenceView, candidate: EvidenceView, out, renderer, soundfont, gain, gapSeconds, includeSource }): Promise<Report<AuditionManifest>>`. Manifest includes source/run/recipe hashes, MIDI event identity, instrument/program/octave/gain, renderer and SoundFont hashes/versions, glide support/enabled status, order, gap, changed source ranges and playback ranges. Renderer config initially uses installed FluidSynth and FFmpeg via execFile argv; no shell strings.

**Primary regression:** `it("locates a quantized change in playback time with identical rendering treatment", ...)`: `expect(manifest.gapSeconds).toBe(1); expect(before.renderSettings).toEqual(after.renderSettings); expect(changed.playback.start).not.toBe(changed.source.start);`.

- [ ] **Step 1: Add failing tests** with mocked process adapters for missing renderer, failed rendering, out-path collisions, names containing shell syntax, unchanged input and cleanup of only newly created partial artifacts. Verify baseline/candidate use identical sound/octave/gain treatment and a one-second default A/B gap. A quantized note's playback range comes from actual shared events, not its source range. Out-of-range octave-shifted notes use the same filtering as tune MIDI. Unsupported glide is explicit, not simulated by a different unrecorded pipeline.
- [ ] **Step 2: Run `npm test -- tools/diapason/audition.test.mjs src/investigation/events.test.ts`; expect audition tests to fail.**
- [ ] **Step 3: Implement audition --out with --recipe or named investigation recipe.** Export shared-pipeline MIDI, before/after WAV and combined A/B audio plus manifest. Use one explicit timing/profile treatment for both versions and preserve measured differences; do not normalize each side independently. Check tool availability and SoundFont before starting; never download/install them. Render into a private staging directory, then publish without clobbering existing outputs. If includeSource is set, copy an explicitly labeled source reference separately.
- [ ] **Step 4: Rerun Step 2; expect pass.** If local renderers exist, run one temporary real audition and verify its files with ffprobe; otherwise report this integration check as skipped. Update README prerequisites and listening-manifest semantics.
- [ ] **Step 5: Commit `Render investigation auditions`.**

### Task 13: Export durable cases and append explicit review records

**Files:** Create tools/diapason/{cases,investigation}.mjs and their tests, src/investigation/review.ts and review.test.ts; extend cases.ts/cases.test.ts, api.ts, commands.mjs and files.mjs.

**Interfaces:** `recordReview(investigation, request: ReviewRequest): Promise<ReviewRecord>`; `exportCase(context, request: CaseExportRequest): Promise<RegressionCase>` returns a manifest/data bundle for the Node adapter to publish. `ReviewRecord` has schemaVersion 1, id, supersedes?, input/PCM/run identities, resolved source coverage, axis, expected value if applicable, status approved|preferred|unresolved, authority user-explicit|agent-proposal, reviewer, timestamp and comment. `appendInvestigation(directory, entry): Promise<void>`, `exportInvestigation(directory, out, { bundleAudio }): Promise<Report<InvestigationManifest>>`, `inspectInvestigation(directory, inputIdentity): Promise<Report<InvestigationSummary>>`.

**Primary regression:** `it("resumes partial review after relocation and cache loss", ...)`: `expect(resumed.recipe).toEqual(original.recipe); expect(resumed.review.targets).toHaveLength(1); expect(resumed.review.targets[0].axis).toBe("pitch"); expect(resumed.evidence).toEqual(original.evidence);`.

- [ ] **Step 1: Write failing tests** for note/range-scoped pitch approval, preferred audition without targets, unresolved status, superseding a review and agent-proposal claiming approved status. Reject mismatched WAV/PCM/run references and ambiguous selectors before saving. Exported cases preserve full-context evidence, settings/versions, seven explicit partial targets where provided, untouched preservation status, hidden edit intent and segment-only/audio-backed distinction. Audio-backed export bundles full source WAV; selected range limits evaluation only. No required artifact refers solely to cache or a temporary input path.
- [ ] **Step 2: Run `npm test -- src/investigation/review.test.ts tools/diapason/cases.test.mjs tools/diapason/investigation.test.mjs src/investigation/cases.test.ts`; expect missing-export/review failures.**
- [ ] **Step 3: Implement --investigation logging and review/case/export/inspect commands.** Append canonical requested queries, complete results/recipes, execution identities and review records atomically; deterministic named recipes make candidate queries runnable after cache deletion. Review requests require an explicit authority/reviewer and expected axis value for approval; reject approved agent-proposals. A tool records the supplied authority, not proof that listening occurred. Durable summaries list remaining disagreements, collateral changes and scope of review. --bundle-audio controls including the original WAV in investigation exports; absent audio is a hash-identified external requirement. case export requires --kind audio-backed|segment-only and --out. Referenced files use relative manifest paths with hashes; reject path traversal and unknown versions.
- [ ] **Step 4: Rerun Step 2 and corpus/CLI tests; expect pass.** Export, delete the disposable cache, relocate investigation directory, supply the WAV by hash and rerun its named recipe. Append a new code identity as a distinct run without rewriting history. Corpus consumes the exported case with the exact original review scope. Update README resumption and explicit review examples.
- [ ] **Step 5: Commit `Preserve investigation evidence`.**

### Task 14: Verify the complete workflow on the real recording

**Files:** Expand src/recording-package-cli.integration.test.ts; create src/investigation/workflow.integration.test.ts; update README.md and this plan's progress only. Do not add the Downloads WAV or rendered audio to the repository.

**Interfaces:** Existing commands only; this task adds no new product API.

**Primary regression:** `it("completes an investigation through the CLI without mutating source bytes", ...)`: `expect(afterWavBytes).toEqual(beforeWavBytes); expect(resumed.runKey).toBe(original.runKey); expect(markdown.scope).toEqual(json.scope);`.

- [ ] **Step 1: Add an end-to-end synthetic regression** exercising Markdown inspect → suggested correction query → explain/frames → explicit automatic comparison → collateral pagination → corpus → case/investigation export → empty-cache resumption. Include non-mutating failure paths and actual CLI invocation outside repository cwd. Assert all three formats carry the same result/scope and no CLI development dependency enters the Vite browser bundle.
- [ ] **Step 2: Run `npm test -- src/investigation/workflow.integration.test.ts src/recording-package-cli.integration.test.ts`; expect pass after all preceding tasks.** Failures return to the owning task; do not weaken provenance or fixture expectations to satisfy a snapshot.
- [ ] **Step 3: Run the manual walkthrough below** on `/home/dkarlovi/Downloads/diapason-fly-me-to-the-moon-1793350323980.wav`, using fresh temporary cache/output/investigation directories. Verify PCM SHA-256 `150d5d23618d70d9fd7f9e8544194a8607f357724317a455e45ef56ca7370f0a`, 32 saved notes, 1,586 frames and seven corrected saved IDs 5, 7, 9, 11, 13, 14, 25. Check current replay status rather than assuming a historical pipeline-4 recording matches current code. Do not turn the unresolved note 11 into an approved algorithmic expectation.
- [ ] **Step 4: Run `npm run format`, `npm run check` and `git diff --check`; require exit 0.** Confirm no baseline growth, modified approved fixtures or committed temporary artifacts. Review README against implemented commands and remove obsolete claims. Record cold/warm elapsed times and identical evidence; no arbitrary performance threshold is required. If renderer tools are unavailable, retain the passing missing-tool test and state that real listening-render verification was skipped.
- [ ] **Step 5: Commit `Verify recording investigation workflow`.** Obtain a whole-branch review before proposing integration; fix substantive findings and rerun affected checks. Do not merge/deploy or publish issue comments as part of executing this plan without the user's corresponding instruction.

## Manual acceptance walkthrough

Use the caller's actual WAV path in every invocation; `WAV` below is a shell
variable set to the supplied Downloads file, not an input identity. Create
temporary output directories without pre-existing artifacts. No analysis scripts
or temporary source instrumentation are needed.

```bash
bin/diapason inspect "$WAV" --format markdown
bin/diapason verify "$WAV" --format json
bin/diapason notes "$WAV" --corrected --format markdown
bin/diapason explain "$WAV" --note 5 --against D6 --format markdown
bin/diapason frames "$WAV" --note 11 --bins 8 --format markdown
bin/diapason notes "$WAV" --similar-to 5 --within-cents 35 --all --format json
bin/diapason stages "$WAV" --note 5 --view automatic --format markdown
bin/diapason controls "$WAV" --all --format markdown
bin/diapason patterns "$WAV" --format markdown
bin/diapason compare "$WAV" --set contextCorrection=1 --format markdown
bin/diapason verify "$WAV" --portable --format json
```

Then use emitted argv/recipe artifacts to compare a named batch, list all
collateral differences, run corpus, render an audition if available, append only
actual review, export a case and investigation, clear that scoped cache and
resume against the same WAV. Repeat comparison after a code-content identity
change to confirm invalidation; do not edit a tuning algorithm merely to test
the invalidation mechanism. The sample's explicit corrections are feedback;
this walkthrough grants no additional transcription approval.

## Self-review and coverage map

- CLI commands, formatting, raw compatibility, bounded summaries, argument safety and errors: Tasks 1–3, 5 and 14.
- All issue-body checks, historical defaults and numeric/event policy: Tasks 2–3 and 11.
- Disposable caching, code/recipe/input invalidation, pruning and non-mutation: Task 4 plus Task 14.
- Note joins, source correspondence, controls, frames, contributions, decoder margins and next steps: Tasks 5–7.
- Explicit/swept recipes, stage reuse, alternative evidence, partial targets and all collateral differences: Tasks 8–9.
- Acoustic similarity, repeated/transposed figures and uncertain tuning trends: Tasks 5 and 10.
- Corpus preservation, recipe equivalence and portable round trips: Task 11.
- Listening, durable scoped cases, review authority and cache-independent resumption: Tasks 12–14.
- All five Review Focus risks have explicit tests in the cited owning tasks. All later interfaces use the names defined above; optional recipes in Task 5 become supported in Task 8. No future command is required for an earlier milestone's tests.
