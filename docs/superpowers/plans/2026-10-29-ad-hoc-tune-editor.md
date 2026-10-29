# Ad Hoc Tune Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open URL tunes directly in a disposable editor, recover work within the tab, and explicitly Save into a recording with edits and history intact.

**Architecture:** Reuse the note-only editor with a sessionStorage-backed ad hoc session instead of recording persistence. Promote its consistent state to IndexedDB in one transaction, then replace the route with the recording editor. Use a data router for unsaved navigation blocking and preserve a dedicated locked tune-embed flag after promotion.

**Tech Stack:** React 19, strict TypeScript, React Router 8, browser sessionStorage/IndexedDB, Vite, Vitest and React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-29-ad-hoc-tune-editor-design.md` (approved, with the subsequent request to extend the HTML embed showcase using the supplied tune).

## Global Constraints

- Use sessionStorage for temporary edits, undo/redo history, and named versions.
- The URL tune is the immutable baseline.
- Place Save in the existing editor actions dropdown in both standalone and embedded ad hoc editors, available even before edits.
- Save must preserve history and redirect to `/recording/:id`; discard must remove the session draft.
- Embedded tune sessions cannot escape to capture or the Library, including after Save.
- Preserve `/diapason/`, existing explicit MIDI/WAV imports, and existing recording embeds.
- Keep browser effects in hooks and reusable calculations in pure modules; use type-only imports, two-space indentation, double quotes, and semicolons.
- Use Node 22+; run `npm run check` before submission. Do not grow committed duplication or health baselines.
- Update README behavior, limitations, and embed examples; extend `dev/embed.html` with the exact user-supplied example payload.

## Review Focus

- A delayed load or Save resolving after a route change must not replace the next editor's state (Tasks 4 and 6).
- A valid-looking session draft with a mismatched baseline, bad cursor, or invalid version must not become playable editor state (Task 1).
- Storage blocked by iframe privacy settings must leave an editable in-memory tune and a clear recovery warning (Tasks 2 and 6).
- A failed cleanup after a committed Save must not create duplicate recordings on retry (Task 6).
- Browser Back during an active pitch gesture, and refresh with an unblurred name, must retain work when canceled or refreshed (Tasks 2 and 5).

## File and responsibility map

| Files                                                                                      | Responsibility                                                            |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `src/ad-hoc-tune.ts`, `.test.ts` (new)                                                     | Draft schema, validation, baseline reconstruction and dirty calculation   |
| `src/ad-hoc-storage.ts`, `.test.ts` (new)                                                  | Synchronous sessionStorage serialization and deletion                     |
| `src/hooks/useAdHocTune.ts`, `.test.tsx` (new)                                             | Decode/recover lifecycle, stable session controller, storage warnings     |
| `src/edit-history.ts`, `src/edit-storage.ts`, `src/db.ts`                                  | History validation and optional persistent history on promoted recordings |
| `src/editor-save-queue.ts`, `src/hooks/useEditHistory.ts`                                  | Atomic full-history writes and external ad hoc persistence                |
| `src/hooks/useEditorVersions.ts`, `src/hooks/useEditor.ts`                                 | Select persistence boundary, reuse editing and version behavior           |
| `src/hooks/useTuneShare.ts`, `src/tune-url.ts`                                             | Share the current working tune and generate editor URLs                   |
| `src/app-router.tsx` (new), `src/main.tsx`                                                 | Data-router setup and tune route entry                                    |
| `src/hooks/useStudioMode.tsx`, `src/components/AppShell.tsx`                               | Recognize ad hoc editor and locked tune embeds                            |
| `src/components/AdHocTuneRoute.tsx` (new), `src/components/Editor.tsx`                     | Load ad hoc session and render the existing editor                        |
| `src/hooks/useAdHocNavigation.ts`, `.test.tsx` (new)                                       | Internal discard/stay guard and native beforeunload warning               |
| `src/tune-promotion.ts`, `.test.ts` (new)                                                  | Atomic recording/history/version promotion                                |
| `src/components/EditorRecordingActions.tsx`, `src/components/EmbeddedRecordingActions.tsx` | Save menu entry and correct actions for ad hoc/locked states              |
| `src/ad-hoc-tune.integration.test.tsx` (new), existing editor/router/embed tests           | Observable flows and regressions                                          |
| `dev/embed.html`, `README.md`                                                              | Editor-embed showcase and user documentation                              |

Use existing test fixtures in `src/test-support/note-recording.ts` and `src/test-support/recording.ts`. Update `src/test-support/editor-storage-double.ts` when extending persistence signatures. Avoid a second editor implementation or a general storage framework.

### Task 1: Define and validate disposable tune state

**Files:** Create `src/ad-hoc-tune.ts` and `src/ad-hoc-tune.test.ts`; modify `src/edit-history.ts`; extend `src/edit-history.test.ts`.

**Interfaces:**

- Export `AdHocTuneDraft = { schemaVersion: 1; fragment: string; id: string; createdAt: number; name: string; history: EditHistory; versions: SavedVersion[] }` from `ad-hoc-tune.ts`. The fragment includes `#tune=` and is the baseline identity.
- `createAdHocDraft(tune: PortableTune, fragment: string, id: string, now: number): AdHocTuneDraft` creates the baseline commit from `recordingFromPortableTune`.
- `validateEditHistory(value: unknown, durationSec: number): EditHistory` from `edit-history.ts` validates commits, IDs, finite timestamps, snapshots, cursor range, and optional gesture draft; never silently clamps bad state.
- `validateAdHocDraft(value: unknown, tune: PortableTune, fragment: string): AdHocTuneDraft` also checks schema, exact fragment, initial baseline snapshot, name, version ownership and unique normalized version names.
- `adHocRecording(tune: PortableTune, draft: AdHocTuneDraft): NoteRecording` reconstructs baseline plus displayed history snapshot and current name.
- `isAdHocDirty(tune: PortableTune, draft: AdHocTuneDraft): boolean` compares current name, displayed musical snapshot, and named versions to the URL baseline.

- [ ] Write tests: `baseline is clean`, `pitch/name/version changes are dirty`, `undo to baseline is clean even with redo history`, `view state is absent from dirty inputs`, `active gesture is dirty`, and `invalid or foreign draft is rejected`. Assert the last case for wrong fragment, changed initial snapshot, out-of-range cursor, unsupported snapshot, version owner mismatch, and duplicate names.
- [ ] Run `npm test -- src/ad-hoc-tune.test.ts src/edit-history.test.ts`; confirm new tests fail for missing interfaces.
- [ ] Implement the interfaces using `captureEditSnapshot`, `displayEditSnapshot`, `sameEditSnapshot`, and existing snapshot validation. Clone inputs; retain the complete redo branch and active draft. Keep the import from history types into storage type-only to avoid a runtime validation cycle.
- [ ] Run the same command; expect all tests to pass.
- [ ] Commit the model and tests with subject `Model disposable tune editor sessions`.

### Task 2: Recover and persist per-tab working state

**Files:** Create `src/ad-hoc-storage.ts`, `src/ad-hoc-storage.test.ts`, `src/hooks/useAdHocTune.ts`, and `src/hooks/useAdHocTune.test.tsx`.

**Interfaces:**

- `readAdHocDraft(storage: Storage, fragment: string): unknown | null`, `writeAdHocDraft(storage: Storage, draft: AdHocTuneDraft): void`, and `clearAdHocDraft(storage: Storage, fragment: string): void`. Use a namespaced versioned key containing the exact fragment; let storage/JSON errors reach the hook.
- Export `AdHocTuneSession` from the hook with `tune: PortableTune`, `getDraft(): AdHocTuneDraft`, `getRecord(): NoteRecording`, `updateDraft(update: (draft: AdHocTuneDraft) => AdHocTuneDraft): void`, `discard(): void`, `warning: string | null`, `dirty: boolean`, `promotedTo: string | null`, and `markPromoted(recordingId: string): void`. Promotion status is in-memory lifecycle state, not part of the stored draft.
- `useAdHocTune(fragment: string)` returns `{ session: AdHocTuneSession | null; error: string | null; retry(): void; discardCorruptDraft(): void }`. Retain a stable controller identity per fragment; keep mutable latest draft in a ref and rerender for derived UI state.

- [ ] Write tests proving same-fragment remount restores name, history/cursor/gesture and versions; another fragment starts clean; discard then reopen starts at baseline; no `localStorage` calls or IndexedDB writes occur. Inject throwing Storage for reads, quota writes and removals and assert a usable session plus explicit warning. A malformed draft should expose a discard/reopen-baseline recovery action without overwriting it silently.
- [ ] Run `npm test -- src/ad-hoc-storage.test.ts src/hooks/useAdHocTune.test.tsx`; expect missing-interface failures.
- [ ] Implement synchronous writes on every controller update, including gesture and name input changes. Decode the URL before recovering storage and validate recovered drafts with Task 1. On storage denial use an in-memory session with a warning; on corrupt data offer explicit discard. Ignore stale async decode results after unmount/fragment changes. No render-time storage writes.
- [ ] Run the focused tests; expect PASS, including a stale decode resolving after a newer fragment.
- [ ] Commit with subject `Recover temporary tune edits within the tab`.

### Task 3: Preserve promoted history through recording saves

**Files:** Modify `src/db.ts`, `src/edit-storage.ts`, `src/editor-save-queue.ts`, `src/hooks/useEditHistory.ts`, and `src/test-support/editor-storage-double.ts`; extend `src/edit-storage.test.ts`, `src/editor-save-queue.test.ts`, and `src/editor-history.integration.test.tsx`.

**Interfaces:**

- Add optional `editHistory?: EditHistory` to recording fields. Store it inline; no new object store or database-version bump is required.
- Extend `saveEditCommit(id: string, commit: EditCommit, expectedHead: EditHead | null, history?: EditHistory): Promise<EditHead>` and `EditorWriter.enqueue(commit: EditCommit, history?: EditHistory): void`. History and snapshot/head must commit in the same existing transaction. Validate that the current history commit matches the supplied commit.
- Add optional `session?: AdHocTuneSession` to `useEditHistory` options and expose `getHistory(): EditHistory | null`. Ad hoc mode restores session history, updates it synchronously after every reducer transition, and never creates a recording writer. Recording mode restores optional saved history, otherwise keeps existing initialization behavior.

- [ ] Write tests for current snapshot/head/history atomicity; stale-head conflict leaves all three unchanged; queue captures immutable full-history/cursor per enqueue; retry preserves latest matching snapshot/history. Cover undo, redo, and commit after undo followed by reopening. Existing recordings without `editHistory` still start a fresh history session.
- [ ] Run `npm test -- src/edit-storage.test.ts src/editor-save-queue.test.ts src/editor-history.integration.test.tsx`; confirm failures describe the missing history persistence.
- [ ] Extend storage and queue signatures, cloning payloads when enqueued. Persist full history only for records already carrying it; ordinary recordings keep their existing behavior. Ad hoc `flush()` finalizes its gesture and synchronously updates sessionStorage without creating an edit head or touching IndexedDB. Preserve current queue release/retry/conflict behavior and StrictMode-safe cleanup.
- [ ] Run the focused tests and `npm run typecheck`; expect PASS. Update existing mocks/call assertions to accept the optional history argument without weakening conflict tests.
- [ ] Commit with subject `Preserve transferred recording undo history`.

### Task 4: Open direct tune links in the shared editor

**Files:** Create `src/app-router.tsx` and `src/components/AdHocTuneRoute.tsx`; modify `src/main.tsx`, `src/tune-url.ts`, `src/hooks/useStudioMode.tsx`, `src/components/AppShell.tsx`, `src/components/Editor.tsx`, `src/hooks/useEditor.ts`, `src/hooks/useEditorVersions.ts`, `src/hooks/useTuneShare.ts`, and `src/components/Library.tsx`. Extend `src/tune-url.test.ts`, `src/hooks/useTuneShare.test.tsx`, `src/router.integration.test.tsx`, `src/portable-tune.integration.test.tsx`, and `src/embed.integration.test.tsx`; create `src/ad-hoc-tune.integration.test.tsx`.

**Interfaces:**

- Export `createAppRouter(): ReturnType<typeof createBrowserRouter>` from `app-router.tsx`; keep basename `BASE`. Its layout renders StudioBoundary/AppShell and an Outlet. Export the route definitions as `appRoutes: RouteObject[]` for `createMemoryRouter` integration tests.
- Extend `Editor` props and `useEditor(id: string, session?: AdHocTuneSession)` with the optional ad hoc session. Existing recording callers remain valid.
- Extend `useEditorVersions` options with optional `session?: AdHocTuneSession`; preserve its existing public return shape. Ad hoc operations use the session's version list and normalized-name rules; regular recording operations use existing storage functions.
- Extend `useTuneShare` with optional third argument `getTune?: () => Promise<PortableTune>`; use it in preference to `loadShareTune` when supplied.
- `useStudioMode()` additionally exposes `tuneLocked: boolean`; it is true for an embedded tune route/legacy fragment or `embed=1&tuneEmbed=1`. Keep path-building query preservation centralized here.

- [ ] Write route tests asserting new links use `/diapason/tune#tune=...`; both this and legacy root `#tune=` links load the editor directly without an import dialog or Library record. Assert malformed/oversized tune links show an inline error, including in embed mode, rather than capture.
- [ ] Run `npm test -- src/tune-url.test.ts src/router.integration.test.tsx src/portable-tune.integration.test.tsx src/embed.integration.test.tsx src/ad-hoc-tune.integration.test.tsx`; confirm failures.
- [ ] Migrate production entry to RouterProvider and data routes. Recognize legacy fragments before Library mounts; normalize with replace while preserving query/hash. Ensure the ad hoc route is an editor for shell sizing, title and portals. StudioBoundary must allow tune entries before its existing capture fallback.
- [ ] Adapt editor loading, name editing, history and versions to the session boundary. Session records require no analysis or audio decode. Derive record state from its initial session record without reloading on every controller rerender. Persist unblurred names immediately to the session; normal recording renames keep the existing blur behavior. Guard asynchronous recording loads against stale routes. Hide unsupported recording actions for ad hoc mode, with menu additions completed in Task 6.
- [ ] Write sharing/version tests: edit and copy a link, decode it and assert current pitches/name/mutes; no recording is created. Save, preview, restore, rename and delete named versions in the draft; duplicate names fail using the same normalized comparison as recording versions. MIDI export also uses the working state without Save.
- [ ] Implement the optional current-tune provider using `createPortableTune` after finishing history/name edits. Remove Library's automatic URL import effect, retaining explicit file imports and the import hook's existing tests where still useful. Ensure ad hoc name commit never overwrites a newer synchronous input with a stale closure.
- [ ] Run the focused route tests plus `npm test -- src/hooks/useTuneShare.test.tsx src/components/Editor.loaded.test.tsx src/components/EditorVersions.test.tsx src/hooks/useRecordingImport.test.tsx`; expect PASS.
- [ ] Commit with subject `Open shared tunes directly in a temporary editor`.

### Task 5: Guard unsaved exits and lock tune embeds

**Files:** Create `src/hooks/useAdHocNavigation.ts` and `src/hooks/useAdHocNavigation.test.tsx`; modify `src/components/AdHocTuneRoute.tsx`, `src/components/Editor.tsx`, `src/hooks/useStudioMode.tsx`, `src/hooks/useEditor.ts`, and the two editor action components. Extend `src/ad-hoc-tune.integration.test.tsx` and `src/embed.integration.test.tsx`.

**Interfaces:**

- `useAdHocNavigation(options: { session: AdHocTuneSession; embedded: boolean; beforeLeave(): void }): void` owns the data-router blocker and beforeunload listener. `beforeLeave` finishes gestures and stops playback; `session.promotedTo` bypasses warnings only for successful promotion. Mount this hook inside the ad hoc Editor so it can call the active history and playback functions.
- Use existing browser confirmation styling unless the repository already supplies an equivalent dialog. Copy: `You have unsaved changes. Discard them and leave?` Cancel stays; confirm clears session state and proceeds.

- [ ] Write data-router tests for dirty Library navigation, capture navigation, browser Back, cancel, and confirmed discard/reopen. Test an active pitch gesture and unblurred name. Assert untouched navigation has no warning and clears any clean draft. Undo to baseline permits an exit unless name or versions still differ.
- [ ] Run `npm test -- src/hooks/useAdHocNavigation.test.tsx src/ad-hoc-tune.integration.test.tsx src/embed.integration.test.tsx`; confirm failures.
- [ ] Implement blocking for standalone internal exits, ensuring canceled navigation keeps state. Register a native beforeunload listener only while dirty; set `returnValue` and prevent default, without clearing the draft on unload. Test the event contract in jsdom; browser-native wording cannot be asserted there. Bypass state must be scoped to successful Save, never a pending or failed Save.
- [ ] Implement tune embed locking: route attempts to Library, capture or a different recording remain on the allowed tune/current promoted recording. Remove Delete/Duplicate actions and any fallback links that escape this embed. Missing promoted recordings show an inline error, not `navigate('/')`. Preserve ordinary capture embeds, including their existing delete-to-start-over behavior. Reload the saved locked URL to prove the marker survives.
- [ ] Run the focused tests; expect PASS, including programmatic route changes and no escape after missing-record lookup.
- [ ] Commit with subject `Protect disposable tune edits and lock tune embeds`.

### Task 6: Promote an ad hoc session through the Save menu

**Files:** Create `src/tune-promotion.ts` and `src/tune-promotion.test.ts`; modify `src/hooks/useEditor.ts`, `src/components/AdHocTuneRoute.tsx`, `src/components/EditorRecordingActions.tsx`, and `src/components/EmbeddedRecordingActions.tsx`. Extend `src/ad-hoc-tune.integration.test.tsx` and `src/embed.integration.test.tsx`.

**Interfaces:**

- `promoteAdHocTune(tune: PortableTune, draft: AdHocTuneDraft, recordingId: string, savedAt: number): Promise<NoteRecording>` in `tune-promotion.ts` validates, reconstructs, and writes the recording and named versions in one `databaseTransaction(['recordings', 'versions'], 'readwrite', ...)`.
- The promoted record includes the complete committed `editHistory`, current snapshot and an initial `editHead` pointing to `currentEditCommit(history)` with revision `1`. Remap saved version `recordingId`; allocate fresh version IDs to avoid collisions. Do not add draft-only fields to the recording.
- Add editor state `adHoc: boolean`, `tuneLocked: boolean`, `savingTune: boolean`, and `saveTune(): Promise<void>`. Regular recording editor mode does not expose Save in the menu.

- [ ] Write transaction tests: baseline-only Save succeeds; edited Save preserves the original baseline, current cursor, redo branch, name and named versions; any failing version write aborts the recording too. Inject an ID collision and assert existing recordings are not overwritten (use `add`, not `put`, for initial promotion).
- [ ] Run `npm test -- src/tune-promotion.test.ts`; expect failure before implementation.
- [ ] Implement atomic promotion. Require finalized gesture state; validate the draft before opening the transaction. Resolve only after transaction commit. Include transferred history on the recording so Task 3 restores it after redirect.
- [ ] Add integration tests clicking Save in each actions dropdown, including before edits. Assert a single new recording, immediate replacement with `/recording/:id`, no fragment, no unsaved prompt, and working Undo/Redo and versions after redirect and remount. Assert embedded Save retains `embed=1&tuneEmbed=1` and no capture controls.
- [ ] Implement the Save coordinator: finish gesture, commit latest name, stop playback, synchronously disable all state-changing UI (including undo/redo keys, version mutations, name input, and drag/knob handlers), clone the session, and allocate one ID for that attempt. Guard double submission with a ref. On success call `session.markPromoted(id)`, clear the draft and replace the route. The blocker reads the controller's latest promotion state immediately, without depending on a React render before navigation. Cleanup failure remains a successful Save with separate warning, never a repeatable promotion error. Ignore stale completion for redirect purposes if the owning session has unmounted; do not corrupt the next editor.
- [ ] Add failure tests: blocked IndexedDB keeps the session and enables retry; cleanup failure after commit still redirects and creates only one recording; repeated clicks create one recording; a delayed completion cannot redirect a newer session. Confirm failure leaves no partial Library entry or version rows.
- [ ] Run `npm test -- src/tune-promotion.test.ts src/ad-hoc-tune.integration.test.tsx src/embed.integration.test.tsx src/editor-history.integration.test.tsx`; expect PASS.
- [ ] Commit with subject `Save temporary tunes as recordings with history`.

### Task 7: Demonstrate editor embeds and finish validation

**Files:** Modify `dev/embed.html` and `README.md`. Retain existing showcase size/cross-origin controls and recording examples.

**Interfaces:** The dev-only page remains served at `/diapason/dev/embed` by the existing Vite middleware. Add an explicit recording/editor mode selector; the editor example is selected initially so opening the showcase demonstrates the new use case.

- [ ] Add the supplied payload as a named constant in `dev/embed.html`, preserving its bytes exactly:

```text
RFBTTgEBABJGbHkgbWUgdG8gdGhlIG1vb27AhAEAAAAAAMBbQAQCABs5rzGxRptNQCDLRqfjjllACAACIAEA4AN5L3lXoclWQAGLBMAC4LT7L3X1VkABwALqATQonEConlZAAeoBqwLdXOG4WxxWQAWWA7UDGve7bqS7VUBWAdUDqwPz50GBZyNVQAWABMADdaztr3vAVUBWAesD4ANMaMpvkiFWQAWVBKAEJfRq0nMZV0BbAaAEgAFis2uz1YZWQAWAAdUGajAqKq_AVkBaAfUHwAFn0YytHiFWQAXgAaACCIAqXRO6VUBWAesCdeibVJdKYVVAAXXrASWyqCgoIlVAAeAClgVASAJabr9UQAHgEusDJxv_AqwBVkABiwTAAugJaxAaCFZAAcAC9QHye8038ZFVQAH1AZYBSkA3qU4vVUABlgGqAe89jrQqIVVAAdUBlQN5hjcrLNZUQAHrA7UDBr22rQVAVEAB4AOqA6hrfoWFBVVAAaAEwAPqXjJQEUpVQAGVBNUFYvEfDmcjVkAB4AarA6D7lgitx1VAAZUEqwLsHlA-mr5VQAHLAusB6Px-C0ApVUAB6wGqAlSh_AxT1FRAAYAD6gLjTIrM3GpUQAHABVVuYkHihuRTQA
```

- [ ] Update showcase URL construction: editor mode uses the selected loopback origin with `/diapason/tune?embed=1#tune=<payload>`; recording mode keeps `/diapason/new?embed=1` and optional `afterRecording=edit`. Disable recording-only checkboxes in editor mode and omit microphone permission delegation from its generated iframe. Give the editor iframe an accurate title; generate matching copyable iframe HTML with escaped attribute ampersands. Preserve dimensions, resize status and cross-origin testing.
- [ ] Revise showcase explanatory text for the selected mode. Editor checks include playback, pitch edits, undo/redo, session refresh, Save in the menu, saved recording redirect and no capture/Library escape. Warn that reloading after Save returns the showcase to its URL-tune example; it does not delete the saved recording. Recording mode retains its microphone/Permissions-Policy guidance.
- [ ] Update README sharing instructions to describe direct temporary editing, sessionStorage, explicit Save/discard and exit prompts. Document history preservation for saved ad hoc tunes and existing audio limitations. Add a concrete editor iframe example using the same example link; explain that editor embeds require no microphone grant and that privacy settings can block storage. Document `tuneEmbed=1` as a preserved saved-editor marker, not a parameter hosts must add to initial tune links. Correct statements that currently say all shared links require Library import or all versions remain purely recording-local.
- [ ] Run `npm run check`. Expect successful typecheck, lint, formatting, duplication/audit baseline checks, coverage tests and production build. Fix findings without increasing baselines. If required git refs are unavailable, report that specific limitation and run unaffected checks; do not claim the full command passed.
- [ ] Run the dev server and manually exercise the showcase in both modes at desktop and narrow sizes, including the generated snippet and the exact supplied payload. Verify no audio permission is requested in editor mode, Save remains in the dropdown, original audio stays unavailable, and post-Save iframe navigation cannot reach capture. Refresh before and after Save and reopen a discarded link. Capture screenshots of editor embeds and the Save menu when browser tooling is available; document unavailable browser verification honestly.
- [ ] Commit documentation/showcase changes with subject `Showcase shared tune editor embeds`.

## Execution notes

Tasks are sequential because routes, session state, history persistence, navigation guards and promotion share interfaces. Task 4 creates a functional direct editor; Tasks 5 and 6 complete exit and persistence semantics before release. Do not publish intermediate behavior as the completed feature.

Before implementation, use the worktree skill to establish isolation, then use the chosen execution workflow. This plan does not authorize deployment, PR publication or messages to other people. Review the final branch against the approved design, with special attention to the promoted-history proposal and iframe restrictions.

## Plan self-review

- Spec coverage: direct/legacy entries and errors (Task 4); per-tab recovery and corrupt/denied storage (Tasks 1–2); edits, names, gestures, versions and exports (Tasks 3–4); dirty exits and embed lock (Task 5); atomic Save and transferred history (Tasks 3 and 6); README, supplied example and full verification (Task 7).
- Interface consistency: the optional session is threaded through editor/history/versions; the queue keeps backward-compatible optional history; ad hoc sharing provides current PortableTune rather than reading a nonexistent recording.
- Failure coverage: all five Review Focus conditions have explicit test steps. Clean undo history, transaction collisions, failed draft cleanup, stale completion, locked missing recordings and native unload behavior are included.
- Scope: no dependencies, backend, parent messaging or second editor; keep ordinary recording history semantics unchanged unless the recording carries transferred history.

## Execution record

Implemented natively on `ad-hoc-tune-editor`. Final verification: `VITEST_MAX_WORKERS=2 npm run check` passed with 616 tests across 103 files, coverage, typechecking, lint, formatting, duplication and health baseline checks, and production build. Baselines were not increased.

The fresh branch review identified delayed Save cleanup deleting a newer draft and silent navigation failure when draft removal was blocked. Both received failing regression tests and fixes. Additional tests cover stale decode results, canceled Back during a pitch gesture, atomic promotion rollback, and the supplied showcase payload.

Headless Chrome verified the supplied example, MIDI playback, Save in the dropdown, the recording redirect with the locked embed marker, absence of escape actions, the narrow layout, and the retained recording showcase. No runtime exceptions were observed. Screenshots are in `docs/screenshots/shared-tune-embed*.png`.

Execution decisions:

- Sandbox restrictions initially prevented Git/worktree setup, so implementation used the existing checkout. Approved elevation subsequently allowed a feature branch and final commit; there is no separate worktree protecting concurrent edits in the original checkout.
- History and snapshot validation were separated to eliminate a runtime import cycle. Save coordination and source loading were extracted from the editor hook. The cost is a few additional module boundaries, with no intended behavior change.
- Final tests ran sequentially with two Vitest workers after competing suites caused timeouts. No timeout limits or assertions were weakened; reduced concurrency can take longer on larger machines.
- The changes are committed together after final verification because initial Git writes were blocked. The cost is no intermediate commit history for individual tasks.

No review findings were deferred. Browser-native confirmation wording and third-party storage policies remain controlled by the browser; automated event tests and the local iframe smoke test cannot prove every deployment's privacy settings.
