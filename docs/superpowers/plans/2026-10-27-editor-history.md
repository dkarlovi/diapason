# Editor History and Versions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically commit completed edits, support fine-grained session undo/redo, and preserve manually named versions across sessions.

**Architecture:** A pure snapshot/history model distinguishes committed intent from drafts. One ordered save coordinator persists the current working state, while an IndexedDB versions store retains self-contained named snapshots. React hooks adapt gestures, playback, and controls to this model; session history is never written to disk.

**Tech Stack:** Existing React, strict TypeScript, Vite, browser IndexedDB, Vitest, React Testing Library, and fake-indexeddb. No new runtime dependencies.

**Spec:** [Approved editor history design](../specs/2026-10-27-editor-history-design.md). Read it alongside this plan; “tag” in that document is internal terminology only.

## Global Constraints

- “The UI calls named saved states **versions**.” Use version terminology in visible text, accessible names, confirmations, notices, and README.
- “Untagged historical states cannot be recovered after the session ends.” Only the latest saved working state and manually saved versions persist.
- “Every session commit stays traversable until session end; there is no silent pruning during a session.”
- “React rendering and persistence debounce are not commit boundaries.”
- “Editing never changes the captured audio.”
- “This is a local edit-history feature, with no server or new runtime dependency.”
- “Existing WAV export continues to exclude editor state.”
- “Preserve explicit overrides, not just the values they currently resolve to.”
- Preserve `/diapason/`, current reset scopes, local recording ownership, and legacy setting resolution. Keep recording names outside musical undo.
- Node 22+, two spaces, double quotes, semicolons, explicit type-only imports. Do not grow committed Fallow baselines.
- Use the modern-web-guidance skill before frontend implementation. Establish an isolated workspace at execution time; do not change product code while writing this plan.

## Review Focus

- A slider loses pointer capture, receives a second touch, or loses keyboard focus: one clear commit/cancel result, never a stuck draft or duplicate commit (Task 5).
- StrictMode cleanup and rapid editor reentry happen while saves are pending: never commit a draft twice, reset history on render, or load an older working state (Tasks 3, 4, 8).
- Another tab changes or deletes a recording: stale saves and version creation must fail visibly, without resurrecting the recording or erasing another tab's versions (Tasks 2, 3).
- An explicit override equals today's preset default, or a pitch drag returns to an already edited pitch with a new edit ID: preserve intent and detect genuine no-ops (Tasks 1, 5).
- Version preview/restore/save overlaps an active gesture or ends naturally: never save an audition, use the wrong instrument, or show stale preview notes (Tasks 6, 7).

## File map and implementation decisions

New pure modules: `src/edit-state.ts` owns snapshots; `src/edit-history.ts` owns session transitions. `src/db-connection.ts` owns the existing shared database connection and migration; `src/edit-storage.ts` owns merged musical writes and versions. `src/editor-save-queue.ts` owns ordered saves and unsaved state across editor unmounts. Keep these responsibilities out of the already large `useEditor.ts`.

New hooks: `useEditHistory.ts`, `useEditorVersions.ts`, `useSliderCommit.ts`, `useEditorHistoryKeys.ts`, and `useEditorSaveStatus.ts`. New views: `EditorHistoryActions.tsx`, `EditorVersions.tsx`, and `EditorSaveStatus.tsx`. Their tests sit beside them. Existing melody, note-drag, playback, library, and editor hooks are integration points, not replacement audio engines.

Storage decision: database version **2**, existing `recordings` store plus a `versions` store. Each version row embeds its commit snapshot; two names on the same commit may duplicate small intent data, never audio. This avoids an additional snapshot store and orphan-collection machinery. The latest working intent remains in existing recording fields, with `editHead?: { commitId: string; revision: number }`. Untagged past states exist only in memory.

Concurrency decision (user clarification): compare-and-swap in a read/write transaction. Each save names the exact saved head it expects to overwrite: `{ commitId, revision }`, or `null` for an untouched legacy recording. Compare both fields atomically; a successful write increments revision even when Undo restores an earlier commit ID, avoiding an A→B→A stale-write match. The first competing writer succeeds; a stale editor enters conflict state and stops saving until it reloads. Never automatically retry a conflict against a newer revision. Version mutations operate on individual rows rather than replacing a cached list.

Normal navigation decision: finish any draft synchronously during cleanup and drain its captured session writer. Writers survive unmount until saved or explicitly resolved; editor reentry waits for pending writes for that recording. A shell-level save notice provides Retry after navigation. No router migration or asynchronous unload guarantee.

All task commits below are implementation-time steps. This planning task only writes documentation.

---

### Task 1: Define editable intent and session history

**Files:** Create `src/edit-state.ts`, `src/edit-state.test.ts`, `src/edit-history.ts`, `src/edit-history.test.ts`.

**Interfaces:**

- `EditSnapshot = { schemaVersion: 1; intent: Pick<Recording, "melody" | "tuning" | "quantize" | "noteEdits" | "muted" | "play"> }`.
- `captureEditSnapshot(record: Recording): EditSnapshot`; `applyEditSnapshot(record: Recording, snapshot: EditSnapshot): Recording`; `sameEditSnapshot(a: EditSnapshot, b: EditSnapshot): boolean`.
- `EditCommit = { id: string; label: string; createdAt: number; snapshot: EditSnapshot }`.
- `EditHistory = { commits: readonly EditCommit[]; cursor: number; draft: { label: string; snapshot: EditSnapshot } | null }`.
- `createEditHistory(baseline: EditCommit): EditHistory`; `reduceEditHistory(history: EditHistory, event: EditHistoryEvent): EditHistory`.
- Events: `{type:"begin";label:string}`, `{type:"update";snapshot:EditSnapshot}`, `{type:"commit";id:string;createdAt:number}`, `{type:"cancel"}`, `{type:"undo"}`, `{type:"redo"}`. `begin` finishes no existing transaction; the hook serializes those boundaries.
- `currentEditCommit(history): EditCommit`; `displayEditSnapshot(history): EditSnapshot`; `canUndoEdit(history): boolean`; `canRedoEdit(history): boolean`. All consume `EditHistory` and return the stated type.

- [ ] **Step 1: Add behavior tests.** `capture and apply preserve legacy intent` asserts absent melody is restored over a later melody while tuning/quantize, audio identity, name, waveform, and imported metadata survive. `snapshots are isolated` mutates the input after capture and asserts the commit is unchanged. `compares intent rather than object order` asserts equal reordered override keys compare equal, explicit override versus absence compares unequal, and pitch edits differing only in generated IDs compare equal. Preserve the baseline snapshot/IDs when an equivalent draft commits.
- [ ] **Step 2: Add history tests.** Use synthetic snapshots for endpoint arithmetic; UI fixtures later must respect each production knob range. `one gesture records endpoints` performs begin, updates 3/4/5/6/7, commit; asserts two commits, undo value 3, redo value 7. `cancel and return to baseline preserve redo` asserts unchanged history. `undo cancels draft first` asserts unchanged cursor on first undo. `editing after undo drops forward path` asserts only the new branch is traversable. `retains all session commits` traverses 1,000 commits back to baseline. Add a reset snapshot followed by Undo/Redo and assert exact restoration.
- [ ] **Step 3: Run the new tests and confirm meaningful failures.** `npm test -- src/edit-state.test.ts src/edit-history.test.ts`. Expect failures for missing modules/exports.
- [ ] **Step 4: Implement the interfaces.** Capture only the listed intent fields using structured cloning; applying a snapshot deletes managed fields absent from it, then overlays its intent onto the current recording. Compare canonical object keys and pitch coverage/value intent, ignoring generated pitch IDs; do not resolve away explicit knob overrides or legacy field presence. Reducer inputs are immutable; allocate commit IDs/timestamps outside the reducer. No IndexedDB or browser effects.
- [ ] **Step 5: Verify and commit.** Run the same focused tests and `npm run typecheck`; expect success. Commit the four new files with subject `Model editor commits and session history`.

Representative assertions for this task (use the fixtures described above):

```ts
expect(sameEditSnapshot(baseline.snapshot, displayEditSnapshot(cancelled))).toBe(true);
expect(committed.commits).toHaveLength(2); // baseline 3, completed gesture 7
expect(currentEditCommit(undone).snapshot.intent.melody?.overrides.steadiness).toBe(3);
```

### Task 2: Add transactional working-state and version storage

**Files:** Create `src/db-connection.ts`, `src/edit-storage.ts`, `src/edit-storage.test.ts`; modify `src/db.ts`, `src/db.test.ts`.

**Interfaces:**

- `openDatabase(): Promise<IDBDatabase>` in `db-connection.ts`; one connection for all stores. Move existing open/upgrade behavior here, closing and clearing its cache on `versionchange`; reject a blocked upgrade with a user-presentable error so retry can reopen.
- Export `EditHead = { commitId: string; revision: number }` from `edit-storage.ts`; add optional `Recording.editHead: EditHead` with a type-only import.
- `SavedVersion = { id: string; recordingId: string; name: string; nameKey: string; createdAt: number; commit: EditCommit }` in `edit-storage.ts`.
- `saveEditCommit(recordingId: string, commit: EditCommit, expectedHead: EditHead | null): Promise<EditHead>` returns the newly saved head.
- `saveRecordingName(recordingId: string, name: string): Promise<void>` merges only name, without changing musical revision.
- `listVersions(recordingId: string): Promise<SavedVersion[]>`; `saveVersion(version: SavedVersion, expectedHead: EditHead | null): Promise<void>`; `renameVersion(recordingId: string, versionId: string, name: string): Promise<void>`; `deleteVersion(recordingId: string, versionId: string): Promise<void>`.
- `EditStorageError` has `code: "conflict" | "missing" | "duplicate-name" | "invalid-version" | "storage"` for presentation/retry decisions.

- [ ] **Step 1: Add database tests.** `upgrades v1 without changing recordings` creates a real version-1 fixture DB and verifies version-2 stores plus the original Blob/typed waveform/legacy settings. `save merges latest metadata` backfills a waveform and renames between load/save, then asserts musical save preserves both. `request success followed by abort rejects` proves promises resolve only on transaction completion. `missing recording is never recreated` and `two writers at revision zero` assert no resurrection and exactly one success. An untouched legacy record expects `null`; success writes revision 1 and the supplied commit ID. Add an A→B→A test: an old `{commitId:A, revision:1}` save must reject after the head becomes `{commitId:A, revision:3}`.
- [ ] **Step 2: Add version tests.** `version survives without parents` asserts a saved version restores independently after a module/session reset. `names are scoped to recording` rejects empty/whitespace names and case-insensitive duplicates after trim, accepts same name on another recording, and never overwrites on collision. `version target never moves` permits rename but asserts commit/snapshot unchanged. `delete last version releases snapshot` asserts the row disappears and no orphan store exists. `deleting recording cascades` verifies both records and version rows disappear atomically, including a competing save attempt. `version mutation does not erase another row` uses independently loaded lists and concurrent row operations.
- [ ] **Step 3: Run focused tests and confirm failure.** `npm test -- src/edit-storage.test.ts src/db.test.ts`.
- [ ] **Step 4: Implement migration and APIs.** Store `versions` by `id`, with index `recordingId` and unique compound index `[recordingId, nameKey]`; normalize names with `trim().toLowerCase()`. Merge snapshots into the latest recording inside a transaction, compare the stored `editHead ?? null` with the complete `expectedHead`, increment revision from 0 when absent, and store head+intent together. Version creation also compares the expected head and checks its commit ID matches the version being named; it does not overwrite working intent. `history.flush()` ensures a previously unsaved baseline has a durable head before version creation. Validate snapshot schema using existing melody/note-edit validators, check playback values against `INSTRUMENTS` and supported octaves, and check recording-duration bounds before restoring/persisting version data; reject malformed snapshots without changing state. Snapshot fields exclude audio/name. Keep all request scheduling within live transaction callbacks; resolve on `oncomplete`, reject on abort/error.
- [ ] **Step 5: Integrate existing DB operations.** Make `putRecording` completion-aware, route `saveWaveform` through the shared connection, and cascade `deleteRecording` through both stores in one transaction. Do not load version snapshots in `allRecordings`. A saved version is one atomic row; no historical snapshot garbage collector is needed. Test schema-version rejection, invalid pitch ranges, and a rename after the record was deleted.
- [ ] **Step 6: Verify and commit.** Run the focused tests and typecheck; commit the five files with subject `Persist editor states and named versions atomically`.

Representative assertions for this task (use the fixtures described above):

```ts
const results = await Promise.allSettled([
  saveEditCommit(record.id, commitB, null),
  saveEditCommit(record.id, commitC, null),
]);
expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
```

### Task 3: Serialize saves and retain retryable failures across navigation

**Files:** Create `src/editor-save-queue.ts`, `src/editor-save-queue.test.ts`, `src/hooks/useEditorSaveStatus.ts`, `src/hooks/useEditorSaveStatus.test.tsx`.

**Interfaces:**

- `EditorSaveStatus = { recordingId: string; state: "saved" | "saving" | "unsaved" | "conflict"; error: string | null }`.
- `createEditorWriter(recordingId: string, initialHead: EditHead | null): EditorWriter`.
- `EditorWriter = { enqueue(commit: EditCommit): void; flush(): Promise<void>; retry(): Promise<void>; getHead(): EditHead | null; release(): void; stop(): Promise<void> }`.
- `flushEditorSaves(recordingId?: string): Promise<void>` drains the registry, including writers from unmounted editors. `subscribeEditorSaves(listener: () => void): () => void`; `getEditorSaveStatuses(): readonly EditorSaveStatus[]`; `retryEditorSaves(recordingId: string): Promise<void>`.
- `useEditorSaveStatus(): readonly EditorSaveStatus[]` uses stable registry snapshots and `useSyncExternalStore`.

- [ ] **Step 1: Add queue tests.** With deferred DB promises, enqueue B, C, Undo-to-B; assert writes execute in order, the complete head returned by one is the expected head of the next, and final durable head is B. `failed write retains newest target` injects quota/abort failure, asserts status unsaved and retry saves latest requested state. `conflict is not retried with a newer revision` asserts no automatic overwrite. `unmounted writer remains retryable` creates another reader and asserts the registry retains the unsaved target. `flush waits for enqueues during drain` asserts no false saved status. Do not persist history arrays or drafts.
- [ ] **Step 2: Confirm tests fail.** `npm test -- src/editor-save-queue.test.ts src/hooks/useEditorSaveStatus.test.tsx`.
- [ ] **Step 3: Implement queue and subscription.** Start writes immediately on enqueue; no 300-ms persistence timer. After a failure, hold pending writes rather than running a poisoned promise chain. Retry can save the latest requested snapshot directly; discarded queued snapshots are still available in active session memory. A conflict requires reload, while storage errors allow retry. `release()` marks a session closed and drops its registry entry only once its queue is saved; retain failed targets/status for recovery. `stop()` waits for any in-flight transaction, discards queued requests, and removes the writer; use it before explicit recording deletion so pending writes cannot recreate the recording. New sessions for the same ID must drain prior writers before creating their own.
- [ ] **Step 4: Verify and commit.** Run focused tests and typecheck; commit new files with subject `Order editor saves and expose retryable status`.

Representative assertions for this task (use the fixtures described above):

```ts
writer.enqueue(commitB);
writer.enqueue(commitC);
writer.enqueue(commitB); // undo is another save of an existing commit
await writer.flush();
expect((await getRecording(record.id))?.editHead?.commitId).toBe(commitB.id);
expect(writer.getHead()?.revision).toBe(3);
```

### Task 4: Route discrete editor actions through global history

**Files:** Create `src/hooks/useEditHistory.ts`, `src/hooks/useEditHistory.test.tsx`; modify `src/hooks/useEditor.ts`, `src/hooks/useMelodySettings.ts`, `src/hooks/useEditor.note-edits.test.tsx`, `src/hooks/useEditorPlayback.test.tsx`, `src/components/EditorTools.tsx`, `src/components/Editor.loaded.test.tsx`; remove `src/hooks/useTuningHistory.ts`.

**Interfaces:**

- `useEditHistory({record, replaceRecord, beforeChange})`, where `record: Recording | null`, `replaceRecord: (record: Recording) => void`, `beforeChange: () => void`. Initialization is once per loaded recording/session, not on each record identity change.
- Returns `{ current: EditCommit | null; canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; drafting: boolean; begin(label: string): void; update(snapshot: EditSnapshot): void; commit(): void; cancel(): void; change(label: string, transform: (record: Recording) => Recording): void; undo(): void; redo(): void; finish(): void; flush(): Promise<void>; getHead(): EditHead | null; stopSaving(): Promise<void> }`.
- `change` finishes any previous draft, applies one discrete transformation, then commits. `finish` commits the current draft without waiting for storage. Writer and mutable history refs update synchronously so multiple actions within one React batch see the latest state.
- `useMelodySettings(recordRef, change)` retains `applyPreset`, `changeKnob`, `resetKnob`, `changeKey`, but performs no DB writes/timers. Here `change` is the history method above; Task 5 supplies separate slider drafts. Keep `changeKnob` a discrete fallback for select controls/programmatic changes.

- [ ] **Step 1: Add hook tests.** Apply preset, shift pitch, mute, reset tuning, change instrument, and Undo through the exact sequence; assert applied state and writer commits match at each point. Reset all note edits, including inactive ranges, and assert one Undo restores the full layer. Rename and backfill waveform between changes; Undo must preserve both. Assert no-op preset/reset actions preserve redo. Undo/Redo during audition stops it and preserves or clears the source-time selection, without changing zoom. Pitch endpoint guards still work.
- [ ] **Step 2: Add lifecycle tests.** Rerender after every edit and assert history does not reset. Change recording ID and assert fresh baseline with no inherited redo. Mount in StrictMode and assert no duplicate baseline saves/commits. Assert each committed action adds one snapshot, while Undo/Redo saves existing commits without appending them.
- [ ] **Step 3: Confirm failures.** Run `npm test -- src/hooks/useEditHistory.test.tsx src/hooks/useEditor.note-edits.test.tsx src/hooks/useEditorPlayback.test.tsx src/components/Editor.loaded.test.tsx`.
- [ ] **Step 4: Implement hook and integration.** Keep a synchronous current-record ref; `replaceRecord` updates display only, without remembering history. Initialize a baseline using the saved head ID if present, otherwise a new ID; do not persist baseline merely on opening. Apply snapshots over latest metadata, enqueue committed/traversed states, and prevent other edits against unapplied audition items. Replace old scoped undo assertions with global chronological behavior. Use `saveRecordingName` for name blur. Update the existing Undo button to use global `canUndo`, `undo`, and the pending action label so this task typechecks; Task 7 relocates it outside Tune. Replace the loaded-editor test that queries `Undo tuning change` with global chronological behavior. Remove all melody and note fire-and-forget whole-record persistence paths. `flush()` first finishes the gesture, ensures a baseline without a saved head is enqueued when necessary, then drains the writer; ordinary opening does not call it. Expose the writer's latest durable head through `getHead()` for version creation; `stopSaving()` delegates to writer `stop()` for deletion. Cleanup finishes the draft, begins a flush, and calls `release()`; its captured writer must not change when a new recording loads.
- [ ] **Step 5: Verify and commit.** Run focused tests and typecheck; remove the old hook and old scoped-undo state from `EditorState`. Commit with subject `Unify editor actions under session undo and redo`.

Representative assertions for this task (use the fixtures described above):

```ts
act(() => result.current.resetAllNoteEdits());
expect(result.current.record?.noteEdits?.pitch).toEqual([]);
act(() => result.current.undo());
expect(result.current.record?.noteEdits).toEqual(editsBeforeReset);
expect(result.current.record?.name).toBe("Keep this name");
```

### Task 5: Commit slider and note gestures at completion

**Files:** Create `src/hooks/useSliderCommit.ts`, `src/hooks/useSliderCommit.test.tsx`; modify `src/components/MelodyKnob.tsx`, `src/components/MelodyPanel.tsx`, `src/components/EditorTools.tsx`, `src/hooks/useMelodySettings.ts`, `src/hooks/useNoteDrag.ts`, `src/hooks/useNoteDrag.test.ts`, `src/hooks/useEditor.ts`, `src/components/MelodyPanel.test.tsx`.

**Interfaces:**

- `EditGesture = { active: boolean; begin(): void; update(value: number): void; commit(): void; cancel(): void }` exported by `useSliderCommit.ts`.
- `useSliderCommit(gesture: EditGesture): Pick<React.ComponentProps<"input">, "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onLostPointerCapture" | "onKeyDown" | "onKeyUp" | "onBlur" | "onChange">`.
- Extend `MelodyPanelProps` with `beginKnob(key: keyof Knobs): void`, `draftKnob(key: keyof Knobs, value: number): void`, `commitGesture(): void`, `cancelGesture(): void`; discrete `changeKnob` remains for dropdown Use actions.
- Change `useNoteDrag` options to consume `gesture: EditGesture`; retain its claims-pointer return value and selected note/view options. Remove its separate pitch-commit callback and consolidate transient pitch state with history drafts. Once no consumer needs it, remove `useDraftPitch` and its import, keeping pure drawing helpers used elsewhere.

- [ ] **Step 1: Add input tests.** `pointer drag commits 3 to 7 once` uses a synthetic controlled range fixture (min 0, max 10) and asserts updates 4/5/6/7 change the controlled display but do not save; pointerup saves 7 once. A track click commits once. A return-to-start gesture is a no-op, including a manually edited note whose generated edit ID changes. `keyboard repeat commits on keyup` groups repeated Arrow/Page/Home/End adjustments; blur finishes a held-key gesture. An input/change with no pointer/keyboard begin (assistive technology) commits as one discrete adjustment.
- [ ] **Step 2: Add cancellation tests.** Escape and pointercancel restore baseline; unexpected lost capture cancels; lost capture after a successful pointerup does not cancel/commit again. A second touch cancels and hands back pan/pinch. Cancelling via global Undo also clears the hook's local pointer/key session so a later pointerup cannot recommit. Separate slider gestures on different controls create separate commits, even with no pause. Retain note-drag threshold and click suppression tests.
- [ ] **Step 3: Confirm failures.** Run `npm test -- src/hooks/useSliderCommit.test.tsx src/hooks/useNoteDrag.test.ts src/components/MelodyPanel.test.tsx src/hooks/useEditor.note-edits.test.tsx`.
- [ ] **Step 4: Implement boundaries.** Begin before the first value update, use pointer capture without suppressing native slider operation, and make finalization idempotent. Escape cancellation wins over subsequent blur. Draft pitch transformations use the source range captured at begin, not a changing displayed note index, and draft updates derive from the baseline to avoid splitting/rebuilding accumulated edits. Only history commit/finish triggers persistence. Observe `gesture.active`: transition to false clears adapter-local gesture state so external Undo/cancel cannot be followed by a stale release commit. Normal teardown clears adapter-local state after the owner finishes its draft. Escape stops any draft note audition too.
- [ ] **Step 5: Verify and commit.** Run focused tests and typecheck. Commit with subject `Commit continuous editor gestures on completion`.

Representative assertions for this task (use the fixtures described above):

```ts
fireEvent.pointerDown(slider, { pointerId: 1 });
for (const value of [4, 5, 6, 7]) fireEvent.change(slider, { target: { value } });
expect(saveEditCommit).not.toHaveBeenCalled();
fireEvent.pointerUp(slider, { pointerId: 1 });
await waitFor(() => expect(saveEditCommit).toHaveBeenCalledTimes(1));
```

### Task 6: Add version save, preview, restore, rename, and delete behavior

**Files:** Create `src/hooks/useEditorVersions.ts`, `src/hooks/useEditorVersions.test.tsx`; modify `src/hooks/useEditor.ts`, `src/hooks/useEditorPlayback.test.tsx`.

**Interfaces:**

- `useEditorVersions({recordingId, history, beforeAction, preview})`: `history` is the Task 4 return value; `beforeAction: () => void` stops playback and clears audition; `preview: (version: SavedVersion) => void` auditions a snapshot without replacing applied intent.
- Returns `{ versions: readonly SavedVersion[]; busy: boolean; error: string | null; saveVersion(name: string): Promise<void>; previewVersion(id: string): void; restoreVersion(id: string): void; renameVersion(id: string, name: string): Promise<void>; deleteVersion(id: string): Promise<void> }`.
- `useEditor` exposes this as `versions` (controller object), plus global history controls from Task 4. Internals use commit terminology; all public action labels use version terminology.

- [ ] **Step 1: Add controller tests.** Save baseline without appending a commit; two names may reference the same commit. Saving during a slider draft finishes it first and awaits `history.flush()` before persisting the version. Saving while auditioning captures only applied intent. Reject blank/duplicate names and show errors without closing the naming UI. DB abort keeps the version absent from the saved list. Switching IDs during a pending load/mutation must not populate the new recording with old versions.
- [ ] **Step 2: Add restore/preview tests.** Version preview uses `applyEditSnapshot` plus existing analysis frames and the saved playback instrument/octave; natural completion and Stop return the roll to the applied state. Restore is one undoable commit, preserves metadata, stops audition, and leaves the version target unchanged. Restore identical intent is a no-op. Save D, Undo to C, edit E, then restore saved D: D remains available even though its redo path is gone. Corrupt/incompatible stored snapshots show an error and leave current state unchanged.
- [ ] **Step 3: Confirm failures.** Run `npm test -- src/hooks/useEditorVersions.test.tsx src/hooks/useEditorPlayback.test.tsx`.
- [ ] **Step 4: Implement version behavior.** Keep versions independent of the session traversal array. Create immutable commit snapshots for persistence and only update the saved list after completed transactions. Rename/delete modify individual IDs; ask deletion confirmation in the view. Generalize audition identity to include `version-<id>` so display/selection guards and reset-on-completion logic cover version previews. Saving/restoring first finishes drafts and clears audition; mutation errors remain user-visible.
- [ ] **Step 5: Verify and commit.** Run focused tests and typecheck. Commit with subject `Add named version actions and auditioning`.

Representative assertions for this task (use the fixtures described above):

```ts
await act(() => result.current.saveVersion("First idea"));
const saved = result.current.versions[0]!;
act(() => editSomethingElse());
act(() => result.current.restoreVersion(saved.id));
expect(captureEditSnapshot(editor.current.record!)).toEqual(saved.commit.snapshot);
act(() => editor.current.undo());
expect(captureEditSnapshot(editor.current.record!)).toEqual(beforeRestore);
```

### Task 7: Expose global undo/redo and the Versions UI

**Files:** Create `src/components/EditorHistoryActions.tsx`, `src/components/EditorHistoryActions.test.tsx`, `src/components/EditorVersions.tsx`, `src/components/EditorVersions.test.tsx`, `src/hooks/useEditorHistoryKeys.ts`, `src/hooks/useEditorHistoryKeys.test.tsx`, `src/components/EditorSaveStatus.tsx`; modify `src/components/EditorRecordingActions.tsx`, `src/components/EditorTools.tsx`, `src/components/Editor.tsx`, `src/components/AppShell.tsx`, `src/editor.css`, `src/studio.css`, `src/components/Editor.loaded.test.tsx`.

**Interfaces:**

- `EditorHistoryActions({state}: {state: EditorState})` provides Undo, Redo, and Versions; mount alongside the existing recording actions in `editor-actions-slot`, retaining the no-slot fallback.
- `EditorVersions({state}: {state: EditorState})` uses the existing Radix Popover primitives, a naming form, saved-version rows, and preview/restore/rename/delete actions. No new dialog dependency.
- `useEditorHistoryKeys({enabled, canUndo, canRedo, undo, redo}: {enabled:boolean; canUndo:boolean; canRedo:boolean; undo:()=>void; redo:()=>void}): void`.
- `EditorSaveStatus(): React.JSX.Element | null` reads Task 3 status, provides Retry for storage errors and Reload for conflicts, and renders once in AppShell rather than duplicating notices per editor.

- [ ] **Step 1: Add interaction tests.** Global controls remain reachable with Tune closed and a note inspector open. Accessible names include `Undo reset pitch` and the corresponding Redo action. Old `Undo tuning change` no longer exists, while Reset remains. Save version, rename, restore, preview/Stop, and confirmed deletion work by keyboard; failed mutation retains user-entered name and displays error. Multiple names on one state display independently. Assert the rendered UI/accessibility text never calls a version a “tag” or asks the user to “commit”.
- [ ] **Step 2: Add shortcut tests.** Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y traverse; unavailable shortcuts preserve browser defaults. Ignore events in text inputs, textarea, editable ancestors, and IME composition; range sliders still allow app undo. Escape during a drag cancels only the draft, not selection. Prevent handling already-consumed events and clean up listeners on unmount.
- [ ] **Step 3: Confirm failures.** Run `npm test -- src/components/EditorHistoryActions.test.tsx src/components/EditorVersions.test.tsx src/hooks/useEditorHistoryKeys.test.tsx src/components/Editor.loaded.test.tsx`.
- [ ] **Step 4: Implement controls and copy.** Use visible `Undo`, `Redo`, `Versions`, `Save version`, `Restore version`, `Rename version`, and `Delete version`. Show version names/dates and clear empty state. Keep version-management changes outside musical Undo/Redo. Use saved/saving/unsaved/conflict status without claiming a pending version is saved. Maintain responsive controls at 390 px and desktop widths, with existing button focus and Popover focus-return behavior.
- [ ] **Step 5: Verify and commit.** Run focused tests, typecheck, and lint. Commit the created/modified UI and hook files with subject `Expose editor undo redo and saved versions`.

Representative assertions for this task (use the fixtures described above):

```ts
expect(screen.queryByRole("button", { name: "Undo tuning change" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Undo reset pitch" })).toBeEnabled();
expect(screen.getByRole("button", { name: "Versions" })).toBeEnabled();
expect(screen.queryByText(/save tag|restore tag|delete tag/i)).not.toBeInTheDocument();
```

### Task 8: Verify session lifecycle, library integration, and release checks

**Files:** Create `src/editor-history.integration.test.tsx`; modify `src/hooks/useEditor.ts`, `src/hooks/useLibrary.ts`, `src/hooks/useLibrary.test.tsx`, `src/components/Library.test.tsx`, `src/components/Editor.loaded.test.tsx`, `README.md`; extend earlier queue/history tests where failures belong.

**Interfaces:** Existing `useEditor` and `useLibrary` public APIs remain intact apart from the approved replacement of scoped Undo tuning. Use `flushEditorSaves` from Task 3 before loading a recording's baseline and before library reload. No version/history fields are added to WAV metadata.

- [ ] **Step 1: Add full lifecycle tests with fake IndexedDB.** Open A, edit, save version V, edit again, Undo, leave, and reopen: the last successfully saved current state and V remain; Undo/Redo start disabled. Restore V and Undo it within the new session. Remount while a writer is draining and assert baseline waits for the latest state. A teardown with an unfinished slider commits once; explicit cancellation followed by teardown commits nothing. StrictMode's synthetic cleanup must not end a real session or manufacture a save.
- [ ] **Step 2: Add ownership/failure tests.** A failed save remains retryable from the shell after leaving the editor; reopening the same recording does not silently load a stale baseline or overwrite the pending target. Two tabs/editors competing on a revision display conflict and never auto-overwrite. Delete while a save is queued cannot resurrect the recording. Both editor and library Duplicate strip `editHead`, start without versions, and preserve current musical intent. Library playback sees the latest completed state. Existing tagged-WAV export/import tests continue to pass without version data.
- [ ] **Step 3: Confirm meaningful failures.** Run `npm test -- src/editor-history.integration.test.tsx src/hooks/useLibrary.test.tsx src/components/Library.test.tsx src/components/Editor.loaded.test.tsx` before completing lifecycle integration.
- [ ] **Step 4: Implement lifecycle integration.** Capture each session's own history/writer during cleanup, never read the next recording's ref in an old flush. Preserve pending writers after unmount and expose storage errors through the shell notice. If a load cannot drain prior saves, show recovery status rather than initializing editable stale state. Both duplicate paths finish pending edits and remove durable head metadata from the copy. Deletion cancels draft instead of committing it, drains/stops that writer, then cascades storage deletion; a failed drain must not prevent explicitly requested deletion once pending writes are stopped. Version rows are scoped to original recording IDs.
- [ ] **Step 5: Update README.** Replace scoped Undo tuning documentation with global session Undo/Redo and shortcuts; explain release-to-commit gestures, undoable Reset, latest-state autosave, named versions, session end, retry/conflict behavior, local storage, and cross-engine sound limitations. Never expose “tag” as the feature name. Remove roadmap items that this delivers.
- [ ] **Step 6: Run release verification.** Use Node 22+ and `npm ci` if locked dependencies are missing (the earlier analysis could not resolve locally installed `zustand/vanilla`). Run `npm run check`; expect typecheck, lint, formatting, duplication/health checks, coverage tests, and production build all passing. Fallow needs `origin/main` and `HEAD^`; resolve repository prerequisites without changing baselines. No new tests are needed solely for the Markdown changes.
- [ ] **Step 7: Browser verification and screenshots.** Serve the production build under `/diapason/`. At desktop and 390-px widths exercise slider 3→7/Undo/Redo, pitch drag cancel, reset/Undo, version save/preview/restore, leaving/reopening, and global actions with Tune hidden. Verify pointer capture/cancellation with real browser events, keyboard focus/shortcuts, unchanged audio, and absence of history state from WAV export. Capture screenshots for the visible UI changes. Do not declare success based solely on mocked gesture tests.
- [ ] **Step 8: Commit the integration and documentation.** Commit with subject `Verify editor history lifecycle and document versions`. Perform whole-branch review against all 14 spec acceptance scenarios before submission; make any review fixes and rerun only affected checks plus required final checks.

Representative assertions for this task (use the fixtures described above):

```ts
await user.click(screen.getByRole("button", { name: "Restore version" }));
await user.click(screen.getByRole("button", { name: /Undo restore version/i }));
expect(currentNotes()).toEqual(notesBeforeRestore);
await leaveAndReopenRecording();
expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
await user.click(screen.getByRole("button", { name: "Versions" }));
expect(screen.getByText("First idea")).toBeVisible();
```

## Self-review and handoff

Spec coverage: intent/snapshot fidelity (1); transactions, migrations, version retention and concurrency (2); ordering/errors (3); chronological undo/reset/selection (4); gestures and no-ops (5); version behavior and previews (6); accessible UI/copy/shortcuts (7); session end, library ownership, docs and real-browser checks (8). Automatic checkpoints are commits, with no timer subsystem to implement.

Interfaces are intentionally sequential: storage depends on snapshots; queue depends on storage; editor history depends on both; versions and UI consume that hook. Implement tasks in order. No new persistent commit graph, graph browser, automatic durable version retention, or export format is part of this plan.

Recommended execution: native implementation in this session, followed by whole-branch review. The eight tasks share state and save interfaces heavily; keeping that context together should reduce integration churn. Implementation begins after the user reviews this plan and chooses execution mode.
