# Tagged WAV Round Trip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The editor's Download WAV writes a WAV carrying the recording-time metadata, and the Library imports such a WAV back into an identical, unedited recording.

**Architecture:** `wav.ts` learns to append extra RIFF chunks; `wav-reader.ts` exposes its chunk walk. A new pure module `src/wav-metadata.ts` builds the payload from a `Recording`, encodes the `dpsn`/`LIST`/`acid` chunks, and parses a tagged WAV back into a `Recording`. `useEditorExports` and `useLibrary` call it; `Library.tsx` adds the button, drop target and notice.

**Tech Stack:** TypeScript (strict), React 19, react-router, Vitest + React Testing Library (jsdom), IndexedDB.

**Spec:** `docs/superpowers/specs/2026-10-26-tagged-wav-roundtrip-design.md`

## Global Constraints

- Audio samples are unchanged: `fmt ` + `data` stay mono PCM16, same bytes as today.
- `encodeWav`/`wavBytes` with no extra chunks stay byte-identical (diagnostics, fixture hashes, `wav.test.ts`).
- Diagnostics exports are not tagged; `diagnostic-snapshot.ts` is not touched.
- RIFF size header correct; odd-length chunks padded with one zero byte (pad not counted in the chunk length).
- Exported values are recording-time values only; melody, note edits, muted, quantize, play are never written.
- Untagged / invalid file message, verbatim: `Only WAVs exported from diapason can be imported for now.`
- A different `provenance.build.pipeline` neither blocks nor warns.
- Use strict TS, type-only imports, oxfmt formatting; don't grow Fallow baselines; `npm run check` passes.

## Review Focus

- **Legacy recordings without `capture.rmsGate` or `source`** — export still works and writes the resolved gate (Task 2 test `exports legacy recordings with resolved gate and whistle source`).
- **A recording whose Level gate knob was edited** — export writes `capture.rmsGate`, not the knob (Task 2 test `ignores editor state`).
- **Dropping several files, one bad** — the good ones still import, one error notice names the problem (Task 4 test `imports the good files when one is untagged`).
- **Dropping a non-file drag (text, a link)** — nothing happens, no crash (Task 4 test `ignores drops without files`).
- **Odd-length JSON / names with non-ASCII characters** — chunks padded, name survives the round trip (Task 2 test `round-trips a non-ASCII name with odd-length payload`).

---

## File Structure

- Modify `src/wav.ts` — optional extra chunks after `data`.
- Modify `src/wav-reader.ts` — export `wavChunks`; `decodeWav` uses it.
- Create `src/wav-metadata.ts` — payload, chunk encoding, tagged-WAV parse → `Recording`.
- Modify `src/db.ts` — `RecordingOrigin` type, optional `Recording.origin`.
- Modify `src/hooks/useEditorExports.ts` — tagged Download WAV.
- Modify `src/hooks/useLibrary.ts`, `src/components/Library.tsx`, `src/styles.css` — import.
- Tests: `src/wav.test.ts`, `src/wav-metadata.test.ts`, `src/wav-metadata.integration.test.ts`, `src/components/Library.test.tsx`.
- Modify `README.md`.

---

### Task 1: RIFF chunk plumbing

**Files:**

- Modify: `src/wav.ts`, `src/wav-reader.ts`
- Test: `src/wav.test.ts`

**Interfaces:**

- Produces:
  - `export interface WavChunk { id: string; data: Uint8Array }` (in `wav.ts`; `id` is exactly 4 ASCII chars)
  - `wavBytes(samples: Float32Array, sampleRate: number, extra: readonly WavChunk[] = []): ArrayBuffer` — extra chunks written in order **after** `data`, so the first 44 bytes keep the plain layout.
  - `encodeWav(samples: Float32Array, sampleRate: number, extra?: readonly WavChunk[]): Blob`
  - `wavChunks(bytes: ArrayBuffer): { id: string; start: number; length: number }[]` (in `wav-reader.ts`; validates the container like `wavView` and throws the same errors). `decodeWav` is reimplemented on top of it with unchanged behaviour.

- [ ] **Step 1: Write the failing tests** in `src/wav.test.ts`:
  - `appends extra chunks after data with padding and a correct RIFF size`: `wavBytes(Float32Array.of(0, 0.5), 48000, [{ id: "abcd", data: Uint8Array.of(1, 2, 3) }])` → `byteLength === 44 + 4 + 8 + 4` (3 bytes + 1 pad); `getUint32(4) === byteLength - 8`; tag at 48 is `"abcd"`, length at 52 is `3`, byte 59 is `0`.
  - `lists chunks and still decodes tagged files`: `wavChunks` of the above returns ids `["fmt ", "data", "abcd"]` with `length` 16, 4, 3; `decodeWav` returns the same `pcm` as for the plain file.
  - The two existing tests stay unchanged (plain output byte-identical).
- [ ] **Step 2: Run** `npm test -- src/wav.test.ts` — Expected: the two new tests FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** `npm test -- src/wav.test.ts src/diagnostics-replay.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/wav.ts src/wav-reader.ts src/wav.test.ts && git commit -m "WAV extra chunks"`

---

### Task 2: Metadata module

**Files:**

- Create: `src/wav-metadata.ts`
- Modify: `src/db.ts`
- Test: `src/wav-metadata.test.ts` (`// @vitest-environment node`, like `wav.test.ts`)

**Interfaces:**

- Consumes: `WavChunk`, `encodeWav` (Task 1); `wavChunks`, `decodeWav` (Task 1); `BUILD_INFO` (`build-info.ts`); `SOUND_PROFILES`, `getSoundProfile`, `analysisOptionsFor` (`recording-profiles.ts`); `resolveKnobs`, `DEFAULT_PRESET` (`melody/knobs.ts`); `newRecordingMelody` (`melody/settings.ts`); `encodeAudio` (`codec.ts`); `summarizeWaveform` (`waveform.ts`).
- Produces:
  - In `db.ts`: `export interface RecordingOrigin { build: { version: string; revision: string; source: string; pipeline: number }; browser: string; audioOutput: string; midiOutput: string }` and `origin?: RecordingOrigin` on `Recording` (doc comment: provenance of an imported recording, written back unchanged on export).
  - `export const METADATA_CHUNK = "dpsn"`, `export const METADATA_SCHEMA = 1`
  - `export type ExportContext = Omit<RecordingOrigin, "build">`
  - `export interface WavMetadata { app: "diapason"; schemaVersion: 1; recording: { id: string; name: string; createdAt: number; bpm: number; beatsPerBar: number; downbeatSample: number; source: NonNullable<Recording["source"]>; capture: CaptureMeta & { rmsGate: number } }; provenance: RecordingOrigin }`
  - `recordingMetadata(record: Recording, context: ExportContext): WavMetadata` — `provenance = record.origin ?? { build: BUILD_INFO, ...context }`; `downbeatSample: 0`; `source = record.source ?? { profileId: "whistle", analysis: getSoundProfile("whistle").analysis }`; `rmsGate = capture.rmsGate ?? tuning?.rmsGate ?? resolveKnobs(DEFAULT_PRESET, {}).levelGate`.
  - `metadataChunks(meta: WavMetadata, durationSec: number): WavChunk[]` — `[dpsn, LIST, acid]`:
    - `dpsn`: UTF-8 `JSON.stringify(meta)`.
    - `LIST`: `"INFO"` then subchunks `INAM` = name, `ICRD` = `new Date(createdAt).toISOString()`, `ISFT` = `diapason ${version} (${revision})`, `ICMT` = `${bpm} BPM, ${beatsPerBar}/4, ${profileId}`; each value NUL-terminated UTF-8, subchunks padded to even.
    - `acid` (24 bytes, little-endian): u32 flags `0`, u16 root note `60`, u16 `0x8000`, f32 `0`, u32 beats `Math.round(durationSec * bpm / 60)`, u16 meter denominator `4`, u16 meter numerator `beatsPerBar`, f32 tempo `bpm`.
  - `encodeTaggedWav(record: Recording, pcm: Float32Array, context: ExportContext): Blob`
  - `recordingFromTaggedWav(bytes: ArrayBuffer): Promise<Recording>` — throws `Error` whose `message` is user-facing:
    - not a WAV, unsupported format, or no `dpsn` chunk / bad JSON / `app !== "diapason"` → `Only WAVs exported from diapason can be imported for now.`
    - `schemaVersion > 1` → `This WAV was exported by a newer diapason. Update diapason and try again.`
    - unknown `profileId`, `analysisOptionsFor({ source }) !== source.analysis` (it returns the same object only when valid), non-finite/≤0 `bpm`, non-integer/<1 `beatsPerBar`, `downbeatSample` not an integer in `[0, pcm.length)`, non-finite capture numbers, missing `id`/`name`/`createdAt` → `This WAV's diapason data is damaged or unsupported.`
    - Builds the `Recording` like `useCapture.ts:172-191`: payload `id`, `name`, `createdAt`, `bpm`, `beatsPerBar`, `source`, `capture`; `sampleRate` from `fmt `; audio trimmed by `downbeatSample`; `durationSec`, `audio: await encodeAudio(trimmed)`, `waveform: summarizeWaveform(trimmed)`, `melody: newRecordingMelody(capture.rmsGate)`, `origin: provenance`. No `noteEdits`, `muted`, `quantize`, `play`, `tuning`.

- [ ] **Step 1: Write the failing tests** in `src/wav-metadata.test.ts` (use `recording()` from `test-support/recording.ts`; context `{ browser: "UA", audioOutput: "unknown", midiOutput: "Browser synth" }`):
  - `round-trips recording-time fields` — record with `id: "abc"`, `name: "Take"`, `createdAt: 1792768375650`, `bpm: 94`, `beatsPerBar: 3`, `capture.rmsGate: 0.004`, `source` whistle → `recordingFromTaggedWav` gives those values, `sampleRate`, `durationSec`, `melody` equal to `newRecordingMelody(0.004)`, `origin.build` equal to `BUILD_INFO`, `origin.browser === "UA"`, and `decodeAudio(result.audio)` equals the input PCM.
  - `ignores editor state` — record with `melody: { preset: "syncopated", key: "C", overrides: { levelGate: 0.05 } }`, `muted`, `quantize`, `play`, `noteEdits` → imported has none of `muted/quantize/play/noteEdits`, and `melody` equals `newRecordingMelody(record.capture.rmsGate)`.
  - `exports legacy recordings with resolved gate and whistle source` — no `source`, `capture` without `rmsGate`, `tuning: { rmsGate: 0.006 }` → `recordingMetadata(...).recording.capture.rmsGate === 0.006`, `source.profileId === "whistle"`; with `tuning: {}` → `0.003`.
  - `keeps the original provenance on re-export` — record with `origin` → `recordingMetadata(record, otherContext).provenance` equals `record.origin`.
  - `writes INFO and acid chunks` — via `wavChunks` on `encodeTaggedWav` output: ids include `"dpsn"`, `"LIST"`, `"acid"`; LIST body starts with `"INFO"` and contains `INAM` "Take", `ISFT` starting `"diapason "`; acid at +12 reads beats `Math.round(durationSec*bpm/60)`, +18 numerator `3`, +20 tempo `94`.
  - `round-trips a non-ASCII name with odd-length payload` — name `"Pjesma č"` chosen so the JSON byte length is odd (assert it) → imported name matches; RIFF size header equals `byteLength - 8`.
  - `rejects untagged and foreign files` — `encodeWav(pcm, 48000)` bytes, random bytes, and a WAV whose `dpsn` holds `{"app":"other"}` all reject with the untagged message.
  - `rejects newer schema` and `rejects damaged metadata` — hand-built `dpsn` payloads (`schemaVersion: 2`; `profileId: "kazoo"`; `analysis.hop: 0`; `bpm: 0`; `downbeatSample: -1`) reject with the exact messages above.
  - `trims audio before a non-zero downbeat` — `downbeatSample: 2` on 5 samples → imported `durationSec` is 3 samples long.
- [ ] **Step 2: Run** `npm test -- src/wav-metadata.test.ts` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `src/wav-metadata.ts` and the `db.ts` additions per the Interfaces.
- [ ] **Step 4: Run** `npm test -- src/wav-metadata.test.ts` — Expected: PASS. Then `npm run typecheck` — Expected: no errors.
- [ ] **Step 5: Commit** `git add src/wav-metadata.ts src/wav-metadata.test.ts src/db.ts && git commit -m "WAV recording metadata"`

---

### Task 3: Fixture round trip and tagged Download WAV

**Files:**

- Create: `src/wav-metadata.integration.test.ts` (`// @vitest-environment node`)
- Modify: `src/hooks/useEditorExports.ts`

**Interfaces:**

- Consumes: `encodeTaggedWav`, `recordingFromTaggedWav`, `ExportContext` (Task 2); `loadFixture` (`test-support/fixtures.ts`); `decodeAudio`; `analyzeRecording`; `recordingNotes`; `notesToMidi`.

- [ ] **Step 1: Write the failing test** `whistle-intro exports and re-imports to the approved Clean MIDI`: build a `Recording` from `src/fixtures/whistle-intro/original.json` → `saved` (it carries `melody.preset: "syncopated"`, proving editor state is dropped), with `audio: new Blob()`; `encodeTaggedWav(record, intro.pcm, ctx)` → `recordingFromTaggedWav(await blob.arrayBuffer())` → `pcm = await decodeAudio(imported.audio)` → `frames = analyzeRecording(pcm, imported.sampleRate, imported)` → `notesToMidi(recordingNotes(imported, frames), { bpm: imported.bpm })` bytes equal `clean.mid` bytes. Also assert `imported.id === "mvl403tu-z13urb"` and `imported.bpm === 94`.
- [ ] **Step 2: Run** `npm test -- src/wav-metadata.integration.test.ts` — Expected: PASS if Tasks 1–2 are right (this is a regression lock, not red-first). If it fails, the defect is in Task 2; fix there.
- [ ] **Step 3: Wire the export.** In `useEditorExports.ts`, extract the `context` object built in `reportInput` into one `exportContext(): ExportContext` used by both `reportInput` and `downloadWav`; `downloadWav` calls `downloadBlob(encodeTaggedWav(current, pcmRef.current, exportContext()), filename("wav"))`.
- [ ] **Step 4: Run** `npm test` — Expected: PASS (editor tests unaffected).
- [ ] **Step 5: Verify playback compatibility locally:** write a tagged WAV to the scratchpad from a node script or the test (not committed), run `ffprobe -v error -show_format -show_streams <file>` — Expected: exits 0, `codec_name=pcm_s16le`, `channels=1`, and `TAG:title=` shows the name.
- [ ] **Step 6: Commit** `git add src/wav-metadata.integration.test.ts src/hooks/useEditorExports.ts && git commit -m "Tagged WAV download"`

---

### Task 4: Library import

**Files:**

- Modify: `src/hooks/useLibrary.ts`, `src/components/Library.tsx`, `src/styles.css`
- Test: `src/components/Library.test.tsx`

**Interfaces:**

- Consumes: `recordingFromTaggedWav` (Task 2); `getRecording`, `putRecording` (`db.ts`); `recordingPath` (`router.ts`); `useNavigate` (react-router).
- Produces from `useLibrary()` additionally: `importFiles(files: readonly File[]): Promise<void>` and `notice: { kind: "success" | "error"; message: string } | null`.
  - Files are processed one at a time. For each: `recordingFromTaggedWav(await file.arrayBuffer())`; if `getRecording(id)` exists, skip writing; else `putRecording`. Then `reload()`.
  - Notice (one per call): all new → success `Imported “<name>”` (one) or `Imported <n> recordings`; a single file that already exists → success `“<name>” is already in your library` and `navigate(recordingPath(id))`; any failure → error notice with the first failure's message (others still imported). Auto-dismiss like `useCapture` (4 s success, 6 s error).

- [ ] **Step 1: Write the failing tests** in `Library.test.tsx` (existing `db` mock; build files with `new File([await encodeTaggedWav(recording({ id: "t1", name: "Shared" }), Float32Array.of(0, 0.5), ctx).arrayBuffer()], "shared.wav", { type: "audio/wav" })`; extend the `codec` mock with a passthrough `encodeAudio` or `vi.importActual`):
  - `imports a tagged WAV from the Import WAV button` — `userEvent.upload(screen.getByLabelText("Import WAV"), file)` → `putRecording` called with `id: "t1"`, the row "Shared" appears, status text `Imported “Shared”`.
  - `imports a dropped tagged WAV` — `fireEvent.drop(libraryRoot, { dataTransfer: { files: [file], types: ["Files"] } })` → same result.
  - `refuses untagged WAVs` — plain `encodeWav` file → `role="alert"` with `Only WAVs exported from diapason can be imported for now.`; `putRecording` not called.
  - `opens the existing recording instead of duplicating` — `recordings` already holds `id: "t1"` → `putRecording` not called; route `/recording/t1` renders (add a `<Route path="/recording/:id" element={<div>Editor route</div>} />`).
  - `imports the good files when one is untagged` — upload `[good, plain]` → `putRecording` called once, alert shows the untagged message.
  - `ignores drops without files` — `fireEvent.drop` with `dataTransfer: { files: [], types: ["text/plain"] }` → no notice, no `putRecording`.
- [ ] **Step 2: Run** `npm test -- src/components/Library.test.tsx` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.** `Library.tsx`: in `.library-heading`, a `<label className="button">` containing an Upload icon (lucide), the text "Import WAV", and a visually hidden `<input type="file" accept=".wav,audio/wav" multiple>` (reset its value after each pick). `#view-library` gets `onDragOver` (preventDefault when `types` includes `"Files"`, set a `data-dragging` attribute), `onDragLeave`, `onDrop` (preventDefault, `importFiles([...dataTransfer.files])` when non-empty). The notice renders as a toast with `role="alert"` for errors and `role="status"` otherwise; give it the same look as `.capture-toast` (styles.css), and a visible outline on `[data-dragging]`.
- [ ] **Step 4: Run** `npm test -- src/components/Library.test.tsx src/hooks/useLibrary.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `git add src/hooks/useLibrary.ts src/components/Library.tsx src/components/Library.test.tsx src/styles.css && git commit -m "Import tagged WAVs"`

---

### Task 5: README and full check

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update README:** Download WAV now embeds the recording-time metadata (tempo, meter, downbeat, level gate, sound profile, capture info, provenance) plus `LIST/INFO` and `acid` chunks; edits are not included, so the receiver gets the unedited take; Library **Import WAV** / drag-and-drop for diapason WAVs; re-importing an existing recording opens it; limitations: only diapason-tagged WAVs import for now, audio editors may strip the tags on re-save, identical notes are guaranteed only between matching analysis versions. If the README lists file import as a roadmap idea, revise it so only plain-file import (#9) remains.
- [ ] **Step 2: Run** `npm run check` — Expected: exits 0 (typecheck, oxlint, oxfmt, Fallow, coverage tests, build). Fix any Fallow duplication/health growth before continuing.
- [ ] **Step 3: Commit** `git add README.md && git commit -m "README: tagged WAV round trip"`
