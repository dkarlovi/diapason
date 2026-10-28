# Portable Tunes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share the current audible and visibly edited tune through a compact URL or Diapason MIDI, then explicitly import it from the Library without audio or sender history.

**Architecture:** Split acoustic segmentation from musical interpretation and add a durable note-backed recording source. One versioned binary payload captures baseline segments, settings, instrument/octave, pitch edits, and mutes; URL and MIDI wrappers use that codec. Source-derived capabilities govern controls, presets, playback, exports, and background jobs.

**Tech Stack:** React, strict TypeScript, Vite, IndexedDB, browser CompressionStream/DecompressionStream, Vitest, React Testing Library. Use existing dependencies.

**Spec:** [Portable tunes design](../specs/2026-10-28-portable-tunes-design.md).

## Global Constraints

- Carry no undo history, saved versions, or previous commits.
- A URL does not contain a MIDI file.
- Preserve the `/diapason/` base path and existing local audio recordings.
- Unsupported controls remain visible, disabled, and accompanied by an explanation.
- No candidate state is written to IndexedDB before explicit import confirmation.
- Instrument and octave are required semantic fields, including when their values equal defaults.
- Preserve sender choices and edit markings; missing audio and acoustic controls are the agreed limitations. Browser/device rendering differences are acceptable.
- Millisecond timing is allowed; rounding must not change pitches, lose edit membership, or accumulate across re-sharing.
- Keep Fallow duplication and health baselines from growing. Update README when behavior is implemented; do not describe this plan as shipped functionality.
- Plan only in this change. Create isolation at execution time using the worktree skill; do not install dependencies, implement, or bypass Git signing configuration during planning.

## Review Focus

1. A Library row can be stale while editor saves are pending: share only one flushed state; a save failure must not copy stale data (Task 6).
2. A canceled/replaced import may finish decoding later: ignore stale completions and never save them (Task 7).
3. Fractional pitch and beat-boundary rounding can change tuning/key decisions: prove musical parity before fixing wire precision (Tasks 1 and 4).
4. Preset preview/reset can bypass disabled sliders: every mutation path must preserve frozen detection settings (Task 3).
5. Nondefault instrument/octave may be omitted or applied twice: verify control selections, scheduled playback, and both transports, including re-sharing (Tasks 4, 5, and 8).

## File and interface map

- `src/note-source.ts`: `NoteSource`, validation, fixed-segment conversion and edit mapping.
- `src/recording-capabilities.ts`: source requirements and shared availability/reason resolver.
- `src/portable-tune.ts`: semantic `PortableTune`, snapshot creation, validation, and local-record construction.
- `src/tune-binary.ts`: bounded binary field primitives and v1 layout; no browser effects.
- `src/tune-codec.ts`: envelope, optional compression, base64url, bounded decode.
- `src/tune-url.ts`: root URL/fragment parsing and construction; no routing effects.
- `src/tune-midi.ts`: tagged MIDI wrapper, bounded reader, and rendered-event verification.
- `src/tune-sharing.ts`: read one committed snapshot and build URL/MIDI artifacts.
- `src/hooks/useTuneShare.ts`: clipboard/download state and fallback presentation.
- `src/hooks/useRecordingImport.ts`: common WAV/MIDI/URL candidate lifecycle; replaces `useWavImport` once its callers are migrated.
- `src/components/RecordingImport.tsx`: extract existing Library review UI and add no-audio information and share-link fallback without enlarging `Library.tsx` substantially.
- Modify existing interpretation, recording persistence, editor/library hooks, controls and exports where the tasks below specify. Tests stay beside each module; integration scenarios go in `src/portable-tune.integration.test.tsx` and existing fixture suites.

No new IndexedDB store is necessary: baseline notes and applied state reside in the same recording object. Existing audio records remain readable without rewriting all stored audio.

### Task 1: Separate fixed notes from acoustic segmentation

**Files:** Modify `src/melody/interpret.ts`, `src/melody/decode.ts`, `src/recording.ts`; create `src/note-source.ts`, `src/note-source.test.ts`; extend `src/melody/interpret.test.ts` and `src/note-edits.integration.test.ts`.

**Interfaces:**

- Export `interpretSegments(segments: Segment[], input: SegmentInterpretationInput): Interpretation` from `melody/interpret.ts`. `SegmentInterpretationInput` contains the current `knobs`, `key`, `timing`, and `range` fields; acoustic `protectedBoundaries` stays with `interpretMelody`.
- `interpretMelody` keeps its public signature and delegates its segmented output to that function.
- `NoteSource` has `version: 1`, `interpretationVersion: 1`, `segments: Segment[]`, `range: { minMidi: number; maxMidi: number }`, and `frozenDetection: Pick<Knobs, "steadiness" | "minNoteMs" | "silenceGapMs" | "levelGate">`.
- Export `validateNoteSource(value: unknown, durationSec: number): NoteSource` and `noteSourceFromAnalysis(record: Recording, frames: Frame[]): NoteSource`.
- Keep source coverage and pitch-override semantics from `note-edits.ts`; the portable representation later maps active overrides to stable segment indices.

- [ ] **Write failing tests.** Test names/assertions: `fixed segments match analysis interpretation` compares key, tuning, automatic pitches and timing before quantization; `edited boundaries survive freezing and reset` compares source coverage and automatic pitch after removing an override; `muted segments remain in baseline` asserts segment count includes muted notes. Use a fractional-pitch fixture and each mood preset, not only synthetic integer notes.
      Core assertion: `expect(interpretSegments(source.segments, input)).toEqual(interpretMelody(frames, input))`, with `source` built from the same fixture and current detection settings.
- [ ] **Run red:** `npm test -- src/note-source.test.ts src/melody/interpret.test.ts src/note-edits.integration.test.ts`. New cases must fail at missing interfaces, while existing fixture expectations remain authoritative.
- [ ] **Implement** the interfaces above by extracting the existing interpretation stage, without changing detector arithmetic, note labeling, or approved MIDI fixtures. Segment using current listening settings and protected boundaries, then freeze that result. Validate finite positive pitches/durations, ordered nonoverlapping source coverage and supported versions.
- [ ] **Run green:** repeat the focused command plus `npm test -- src/melody/intro.integration.test.ts src/melody/replay.integration.test.ts src/pitch-parity.integration.test.ts`. All pass without fixture regeneration.
- [ ] **Commit:** `git commit -m "Separate note interpretation from acoustic detection"` after staging only this task's files.

### Task 2: Store and load recordings without audio

**Files:** Modify `src/db.ts`, `src/recording.ts`, `src/recording-settings.ts`, `src/analysis-jobs.ts`, `src/hooks/useAnalysisStatus.ts`, `src/hooks/useEditor.ts`, `src/hooks/useLibrary.ts`, `src/hooks/useWaveformBackfill.ts`, `src/edit-state.ts`, `src/edit-storage.ts`, and audio-only consumers found by typechecking; extend their colocated tests and `src/db-upgrade.test.ts`.

**Interfaces:**

- Export `AudioRecording`, `NoteRecording`, and `Recording = AudioRecording | NoteRecording` from `db.ts`. Common fields retain current names and musical/edit fields. Audio records keep required `audio`, `sampleRate`, `capture`, optional `waveform`, and `noteSource?: never`; note records require `noteSource: NoteSource` and omit those audio-only fields (`?: never`). Existing optional `source` acoustic profile remains an audio-only field.
- Export `isAudioRecording(record: Recording): record is AudioRecording` from `db.ts`, discriminating by validated note-source presence. Legacy records with no note source are audio records.
- Keep `processRecording(record: Recording, frames: Frame[])` and `recordingNotes` signatures. Branch to `interpretSegments` for note sources; ignore frames for them. Resolve pitch range from the stored note source.
- Narrow `requestAnalysis`, analysis-cache keys and WAV encoding inputs to `AudioRecording`; note sources never enter them. Maintain a separate source-ready/editor-ready state instead of pretending acoustic analysis ran.

- [ ] **Write failing tests.** `note recording survives storage reload without analysis cache` checks notes, edits, mutes, instrument and octave; `note library playback never decodes audio` spies on decode/analysis/backfill and asserts zero calls; `legacy audio record still loads` uses an existing database fixture. Cover duplicate/delete and fresh local history behavior.
      In the Library playback test, assert `expect(decodeAudio).not.toHaveBeenCalled()` and `expect(requestAnalysis).not.toHaveBeenCalled()` after invoking MIDI playback on the stored note record.
- [ ] **Run red:** `npm test -- src/db.test.ts src/db-upgrade.test.ts src/hooks/useLibrary.test.tsx src/hooks/useWaveformBackfill.test.tsx src/hooks/useEditorPlayback.test.tsx`.
- [ ] **Implement** the union and source-based loading, make MIDI playback load only the information it needs, and skip note-backed rows in waveform backfill. Save source and state in one recording transaction. Preserve existing edit snapshot fields and range-based pitch edits so current history machinery can be reused. Adapt test factories for explicit audio/note variants rather than weakening production types.
- [ ] **Run green:** repeat focused tests and `npm run typecheck`. No fake empty audio Blob, capture metadata, or sample rate is introduced to satisfy a type.
- [ ] **Commit:** `git commit -m "Support durable note-backed recordings"`.

### Task 3: Derive editor capabilities and explain unavailable controls

**Files:** Create `src/recording-capabilities.ts` and `.test.ts`; modify `src/melody/knobs.ts`, `src/hooks/useMelodySettings.ts`, `src/hooks/useEditor.ts`, `src/hooks/useEditorPlayback.ts`, `src/hooks/useEditorExports.ts`, `src/components/MelodyPanel.tsx`, `MelodyKnob.tsx`, `MelodyPresets.tsx`, `EditorCanvas.tsx`, `EditorTools.tsx`, `EditorRecordingActions.tsx`, `EmbeddedRecordingActions.tsx`, `Library.tsx`, and `src/editor.css`; extend `MelodyPanel.test.tsx` and hook/editor tests.

**Interfaces:**

- `RecordingCapabilities` has `audio`, `analysis`, `fixedNotes`, `musicalPitch`, `musicalTiming`, and `noteEdits` booleans. Export `recordingCapabilities(record: Recording): RecordingCapabilities` and `knobAvailability(record: Recording, key: keyof Knobs): { enabled: boolean; reason?: string }`.
- Add a source requirement to each `KnobDef`. Detection's four knobs require analysis; key/shape require musical pitch; rhythm requires musical timing.
- Export `constrainMelodyChange(record: Recording, next: MelodySetting): MelodySetting`. For fixed sources, keep frozen detection values while allowing supported preset/key/override changes; reuse for application, preview, reset, and slider gestures.
- Expose capabilities and availability from editor state; use those for actions, including direct invocation guards.

- [ ] **Write failing tests.** `fixed tune disables detection with accessible reasons` checks all four inputs and their reset/preview controls; `preset preview and reset preserve frozen detection` asserts supported settings change but frozen values do not; `audio commands are guarded without audio` checks direct handlers as well as buttons. Verify key, rhythm, note edits and playback choices remain enabled in full and embedded editors.
      Assert `expect(screen.getByRole("slider", { name: "Steadiness" })).toBeDisabled()` and `expect(screen.getByRole("slider", { name: "Pull into key" })).toBeEnabled()` for a ready note-backed editor.
- [ ] **Run red:** `npm test -- src/recording-capabilities.test.ts src/components/MelodyPanel.test.tsx src/hooks/useEditor.note-edits.test.tsx src/embed.integration.test.tsx`.
- [ ] **Implement** common capability resolution and guarded transforms. Explain detection unavailability with accessible adjacent text: “Requires pitch analysis. This tune contains fixed notes.” Show that audio was not included; disable audio playback/WAV/trace/audio diagnostics without showing a failed-analysis state. Keep disabled controls visible and preserve meaningful frozen values. Presets show that detection settings do not apply.
- [ ] **Run green:** repeat focused tests plus `npm test -- src/components/Editor.loaded.test.tsx src/hooks/useEditorPlot.test.tsx src/components/Library.test.tsx`.
- [ ] **Commit:** `git commit -m "Make studio controls respect source capabilities"`.

### Task 4: Build and measure the packed portable payload

**Files:** Create `src/portable-tune.ts`, `src/tune-binary.ts`, `src/tune-codec.ts`, their `.test.ts` files, `tools/measure-tune-payload.mjs`, and `docs/portable-tune-format.md`; modify test fixture helpers only as needed.

**Interfaces:**

- `PortableTune` contains `schemaVersion: 1`, `name`, `durationMs`, `bpm`, `beatsPerBar`, `noteSource`, `melody: MelodySetting`, `effectiveKnobs: Knobs`, `play: PlaySettings`, sparse `pitchEdits: { noteIndex: number; midi: number }[]`, and `mutedIndices: number[]`. Store preset identity and original override membership as well as effective values, to preserve visible sender choices without depending on future preset defaults. No IDs, edit heads, history, versions, capture info or device routing.
- Export `createPortableTune(record: Recording, frames: Frame[]): PortableTune`, `validatePortableTune(value: unknown): PortableTune`, and `recordingFromPortableTune(tune: PortableTune, id: string, importedAt: number): NoteRecording`. The latter maps note-index edits to stable source ranges, assigns fresh edit IDs, and starts without `editHead`.
- `packTune(tune: PortableTune): Uint8Array` / `unpackTune(bytes: Uint8Array): PortableTune` are pure binary operations. `encodeTune(tune: PortableTune): Promise<Uint8Array>` / `decodeTune(bytes: Uint8Array): Promise<PortableTune>` own envelope/compression. Export strict `toBase64Url(bytes)` / `fromBase64Url(text)` helpers.

- [ ] **Write failing round-trip tests.** Include every instrument (`beep`, `epiano`, `pluck`, `flute`, `trumpet`, `saxophone`, `pad`) and octave (`1`, `0`, `-1`, `-2`, `-3`); assert `decoded.play` equals sender settings exactly and `recordingFromPortableTune` preserves them. Compare baseline, visible preset/overrides, current automatic/final pitches, edited marks, mutes, trailing silence, and reset results. Re-encode/re-import repeatedly and assert timing does not drift. Empty/all-muted tunes remain valid.
      Core assertions: `expect((await decodeTune(await encodeTune(tune))).play).toEqual(tune.play)` and `expect(recordingFromPortableTune(tune, "new-local-id", 123).editHead).toBeUndefined()`.
- [ ] **Write boundary/size tests.** Reject truncation, integer overflow, unknown instrument/enum/version, invalid edit indices, unordered segments, invalid UTF-8, trailing garbage, and compression bombs. Include fractional pitch and grid/key boundary cases. Assert `encoded.length <= raw.length + envelope overhead` and compare URL character counts with JSON/base64 of the same semantic data; do not compare against an artificially verbose audio dump.
- [ ] **Run red:** `npm test -- src/portable-tune.test.ts src/tune-binary.test.ts src/tune-codec.test.ts`.
- [ ] **Implement semantic conversion and v1 wire format.** Use canonical millisecond integers, deltas/varints for time, sparse pitch overrides, mute bits, explicit stable instrument codes and a 3-bit octave code. Keep settings' supported UI precision and exact sender values where needed; never quantize a manually chosen pitch. Start with Float64 baseline pitch evidence; reduce only with demonstrated parity. Use arithmetic varints with checked safe-integer bounds rather than JavaScript bitwise operations that truncate long values to 32 bits.
      Preserve the v1 preset-default table as interpretation-versioned behavior. Validate effective values against the decoded recipe; an incompatible interpretation version is rejected rather than reconstructed from changed current defaults. Original override membership still determines the visible preset/custom indication.
- [ ] **Resolve the precision gate.** Compare fixed-source interpretation before and after packing on existing fixtures plus adversarial beat/tuning boundaries. If millisecond rounding changes a discrete pitch/key decision, retain the minimal extra interpretation context or sparse exact-time refinements needed to preserve it; document their v1 encoding. Never solve this by flattening overrides or silently changing the melody. Final performed timing still uses the agreed millisecond representation.
- [ ] **Implement bounded compression/envelope.** Use the smaller of raw bytes and gzip including envelope overhead. Incrementally cap decompressed output before allocation. Initial builder limits: 1 MiB encoded input, 4 MiB decompressed data, 20,000 notes, one hour duration, and 1,024 UTF-8 name bytes. Keep these in exported constants and test rejection; they are implementation limits, not claims about browser support. Version and validate interpretation behavior separately from schema parsing.
- [ ] **Run green and measurements:** repeat focused tests; run `node tools/measure-tune-payload.mjs` using committed fixtures and generated short/long repeated and varied tunes. Record note counts, raw/packed/compressed bytes, URL lengths, and JSON comparison in the format document. Freeze the chosen layout only after parity checks; commit independent decoding examples/golden bytes rather than tests that only round-trip one shared bug.
- [ ] **Commit:** `git commit -m "Pack portable tune state into a versioned binary payload"`.

### Task 5: Wrap the payload in playable Diapason MIDI

**Files:** Create `src/tune-midi.ts`, `src/tune-midi.test.ts`; modify `src/midi.ts` only to expose reusable event/chunk construction; extend `src/test-support/midi-files.ts` without changing its current callers' meaning.

**Interfaces:**

- `encodeTuneMidi(tune: PortableTune): Promise<Blob>` and `decodeTuneMidi(bytes: Uint8Array): Promise<PortableTune>`.
- Preserve `notesToMidi(events, opts)` byte output for existing diagnostics/fixtures. Add an optional tagged-writer path rather than making every low-level MIDI use carry metadata.
- Framing choice: one standard text meta-event containing ASCII `diapason:tune:1:` followed by base64url of the encoded payload. MIDI overhead does not affect URL compactness and this avoids inventing a manufacturer ID. Reject multiple conflicting payload events.

- [ ] **Write failing tests.** Parse standard events independently; assert tempo/meter, final audible pitches including playback octave, and a General MIDI program corresponding to the selected instrument using the existing `midi-playback.ts` mapping. Assert importing restores original note pitches plus separate instrument/octave once, without double transposition. Reject untagged, stripped, damaged, newer-version or conflicting metadata and rendered tracks edited out of agreement with the payload.
      Round-trip assertion: `expect((await decodeTuneMidi(new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer()))).play).toEqual(tune.play)`; separately compare independently parsed note events, not only this round trip.
- [ ] **Run red:** `npm test -- src/tune-midi.test.ts src/midi.test.ts src/midi-playback.test.ts`.
- [ ] **Implement** a bounded SMF writer/reader for our own output. Reuse a shared GM mapping from `midi-playback.ts`. Compare the standard rendered melody against the decoded payload at the exported PPQ's tick resolution. Safely reject unexpected event structure; generic MIDI parsing/import is out of scope. External synth timbre is approximate; Diapason's metadata restores its exact instrument selection. Use current external-output pitch-range/clamping semantics consistently.
- [ ] **Run green:** repeat focused tests plus diagnostic MIDI parity tests. Confirm metadata is ignored by the independent MIDI reader and the ordinary events remain playable.
- [ ] **Commit:** `git commit -m "Round-trip editable tunes through Diapason MIDI"`.

### Task 6: Share one coherent snapshot from Library and editor

**Files:** Create `src/tune-url.ts`, `src/tune-sharing.ts`, `src/hooks/useTuneShare.ts` and tests; modify `src/components/Library.tsx`, `src/hooks/useEditorExports.ts`, `src/hooks/useEditor.ts`, and Library/editor tests. Reuse `src/editor-save-queue.ts` and `src/ui.ts`.

**Interfaces:**

- `tuneUrl(tune: PortableTune, origin: string): Promise<string>` always creates `${origin}/diapason/#tune=...`; `tuneFromFragment(fragment: string): Promise<PortableTune | null>` ignores unrelated fragments and rejects malformed recognized ones.
- `loadShareTune(recordingId: string): Promise<PortableTune>` flushes pending saves, reads the latest record, requests analysis only for audio sources, then creates the snapshot. Never read a rendered Library row as the definitive state.
- `useTuneShare()` exposes `copyLink(recordingId: string): Promise<void>`, `downloadMidi(recordingId: string): Promise<void>`, busy/error state and `fallbackLink: string | null`.
- Start with a 16,384-character full-URL offer limit; larger payloads produce a MIDI-download alternative, never a truncated link. Treat this as a product limit to validate in Task 8, not a guaranteed browser/message-app standard.

- [ ] **Write failing tests.** `share waits for pending saves and uses latest play settings` delays the save and asserts instrument/octave plus edits come from its result; `failed flush produces no clipboard write`; `audition is not shared`; `clipboard denial exposes selectable full link`; `oversized link offers MIDI`. Root/base-path tests assert no sender recording ID in the URL.
      Before releasing the delayed save, assert `expect(navigator.clipboard.writeText).not.toHaveBeenCalled()`; after completing it, decode the written URL and assert `expect(imported.play).toEqual({ instrument: "flute", octave: -2 })`.
- [ ] **Run red:** `npm test -- src/tune-url.test.ts src/tune-sharing.test.ts src/hooks/useTuneShare.test.tsx src/components/Library.test.tsx`.
- [ ] **Implement** Library **Copy tune link** and **Download MIDI** actions with coherent busy/error feedback. Editor MIDI export finishes/flushed edits before using the same snapshot and tagged exporter. Keep diagnostic `notesToMidi` consumers unchanged. Expose selectable link fallback with accessible labeling; success notices follow successful clipboard/download preparation. Do not transport transient preview state or MIDI device selection.
- [ ] **Run green:** repeat focused tests and `npm test -- src/editor-history.integration.test.tsx src/components/Editor.loaded.test.tsx`.
- [ ] **Commit:** `git commit -m "Share current tunes from the Library"`.

### Task 7: Offer explicit Library import for URLs and MIDI

**Files:** Create `src/hooks/useRecordingImport.ts` and tests, `src/components/RecordingImport.tsx`; migrate `src/hooks/useWavImport.ts`, `src/hooks/useWavDrop.ts`, `src/components/Library.tsx` and existing import tests; extend `src/router.integration.test.tsx` and `src/router.ts` only if routing helpers are needed.

**Interfaces:**

- `useRecordingImport(onImported: () => Promise<void>, showNotice: (notice: Notice | null) => void)` exposes `offerFiles(files: readonly File[]): Promise<void>`, `offerTune(tune: PortableTune): void`, `candidates`, `busy`, `confirm(): Promise<void>`, and `cancel(): void`.
- Candidate union distinguishes existing tagged WAV semantics from a portable tune: WAV duplicate checks keep embedded IDs, while tune candidates get fresh local IDs only at confirmation.
- Library consumes recognized `location.hash` with `tuneFromFragment`; no editor navigation or automatic save. Import/cancel removes only the handled tune fragment with replace navigation.

- [ ] **Write failing tests.** Following a tune URL offers its name/tempo/meter/duration and “No original audio”; assert zero candidate DB writes before confirmation, on cancel, and on invalid input. Confirm adds one fresh note record, remains on Library, clears the fragment, and shows optional **Open**. Refresh before deciding reconstructs the offer; refresh after deciding does not. Simulate delayed decoding after cancellation/replacement and a rejected storage transaction: no stale saves, partial records, or success notices.
      With a real empty test database, assert `expect(await allRecordings()).toEqual([])` after the import offer appears and again after **Cancel**; after **Import**, assert the resulting record has no `audio` or `editHead` field and a fresh ID.
- [ ] **Write regression tests.** Import `.mid`/`.midi` through picker/drop; reject ordinary MIDI clearly; mixed WAV/MIDI batches review each candidate. Reimporting a portable tune makes an explicit copy; existing WAV duplicate behavior remains unchanged. A new offer must not silently confirm a pending batch.
- [ ] **Run red:** `npm test -- src/hooks/useRecordingImport.test.tsx src/components/Library.test.tsx src/router.integration.test.tsx src/wav-metadata.integration.test.ts`.
- [ ] **Implement** shared candidate lifecycle and extracted review UI; use request-generation tokens, guard double confirmation, and allocate/store only at explicit confirmation. Atomically save each portable record's complete source and state with no edit head/history/versions. Keep multi-file partial-failure reporting accurate. Picker/drop hints name Diapason WAV and MIDI formats.
- [ ] **Run green:** repeat focused tests. Assert candidate import never requests microphone access, decodes absent audio, starts acoustic analysis, or autoplays.
- [ ] **Commit:** `git commit -m "Import shared tunes through Library confirmation"`.

### Task 8: Verify the complete portable tune experience and document it

**Files:** Create `src/portable-tune.integration.test.tsx`; extend existing Library/editor/embed tests as necessary; update `README.md` and `docs/portable-tune-format.md` with actual measurements/limits.

**Interfaces:** Consumes Tasks 1–7 public APIs. Adds no second serializer, alternate capability rules, or audio substitute.

- [ ] **Write failing integration tests.** Create an audio-backed fixture with nondefault instrument (`flute`) and octave (`-2`), customized key/preset/rhythm, a pitch correction, and a mute. Share through both transports into an empty real test IndexedDB; inspect before confirming to prove no candidate writes. Confirm, play from Library, open editor, and assert selected instrument/octave/control values, corrected/muted markings and missing-data explanations. Verify playback receives `play: { instrument: "flute", octave: -2 }`.
      Assert `expect(playNotes).toHaveBeenCalledWith(expect.any(Array), expect.any(Number), { instrument: "flute", octave: -2 })`, then inspect the Instrument and Octave controls' selected values. Neither assertion substitutes for the other.
- [ ] **Add recipient continuation cases.** Reset the imported pitch override after changing key, unmute, change instrument/octave, undo that new change, refresh, duplicate, delete the analysis cache, re-share, and import again. Source notes and edit markings survive; sender history/versions never appear; every new share uses the new playback choices. Run equivalent empty/all-muted and near-boundary timing cases.
- [ ] **Run red/green:** `npm test -- src/portable-tune.integration.test.tsx`. Fix integration defects in owning modules; do not weaken precision or source-capability requirements to make the test pass.
- [ ] **Verify in browsers.** In available Chromium and Firefox environments, test a copied URL in a fresh profile, explicit import/cancel/reload, MIDI picker/drop, visible disabled-control explanations, selectable clipboard fallback, and synth playback. Check short/long links through the intended sharing channel when available; record environmental limitations rather than claiming unperformed checks. Capture screenshots for later PR review.
- [ ] **Update documentation.** Explain that URLs/MIDI transport current edits/settings/instrument/octave without original audio or sender history, describe explicit Library import and unavailable controls, Diapason-only MIDI support, external-tool metadata stripping, size limits and MIDI fallback. Distinguish the existing WAV behavior and externally approximated MIDI instrument sounds.
- [ ] **Run required verification:** `npm run check` and `node tools/measure-tune-payload.mjs`. All checks must pass without changed approved audio/MIDI fixture expectations or increased committed baselines. Inspect `git diff --check` and the final diff for missing audio guards and accidental history serialization.
- [ ] **Commit:** `git commit -m "Verify and document portable tune round trips"`.

## Self-review and execution handoff

Spec coverage: Tasks 1–2 own source fidelity and persistence; Task 3 owns capabilities/presets; Task 4 owns state packing, precision, bounds and version compatibility; Task 5 owns MIDI interoperability; Task 6 owns current-state capture/sharing; Task 7 owns write-free offers and explicit import; Task 8 proves full audible/visible parity and documentation. All five Review Focus conditions have named tests above.

Implementation decisions introduced by this plan: additive note-record union, initial defensive codec limits and URL offer limit, standard text-event MIDI metadata framing, and octave/GM mapping in the tagged rendered MIDI while retaining the existing low-level writer's output. Instrument/octave remain separate editable playback choices in the embedded payload; importing never bakes octave into baseline pitches.

Review this plan before implementation. Recommended execution is **native** because these tasks share tightly coupled source, capability, and codec interfaces; one implementer can carry that context through the changes and request a whole-branch review at the end. Subagent-driven execution is also available if independent review after each task is preferred.

## Execution result

Implemented natively without commits, as requested. `npm run check` passed with
98 test files and 589 tests, including coverage, Fallow audit and the production
build. No committed duplication or health baseline was increased. Real Chrome
and Firefox checks verified read-only link inspection, explicit Library import,
instrument/octave restoration, disabled controls and tagged MIDI round trips.

The final independent review found two issues, both fixed with failing regression
tests first: Float64 timing ties changing pitches after packing, and source bounds
allowing unusable imported pitch edits. Packing now verifies the actual decoded
melody; source endpoints are bounded consistently before import. Full-audio
fixture tests retain their exact hashes/assertions with a 60-second timeout for
V8 coverage on shared runners. Recorded fixture links measure 348–540 characters.

All task commit steps were intentionally omitted. Detailed execution decisions
and test evidence are retained in the ignored plan workspace ledger.
