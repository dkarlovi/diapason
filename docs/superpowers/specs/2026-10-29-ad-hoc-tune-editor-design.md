# Ad hoc tune editor

## Intent and agreed behavior

Opening a shared tune should immediately show its playable, editable editor without importing it into the Library. This also lets an iframe embed a particular tune. The URL tune is the immutable baseline. Temporary work belongs to the current browser tab until explicitly saved or discarded.

Use sessionStorage for temporary edits, undo/redo history, and named versions. Refresh resumes that tab's work. Save creates a normal IndexedDB recording with the current state and history, removes the temporary draft, and replaces the URL with the recording editor route. Subsequent edits belong to that recording. Discard removes the temporary work; it must not reappear on returning to the link.

In full app mode, users can leave for the Library or capture. Leaving an edited ad hoc tune requires an unsaved changes warning. In embed mode, users cannot escape the tune to capture or the Library, including after Save redirects to the recording editor.

## Approaches

- sessionStorage drafts: survive refresh, remain scoped to the tab, and require no Library writes. Selected by the user.
- localStorage drafts: survive browser closure and require expiration and cross-tab rules. Rejected because the work is disposable session work.
- Memory-only drafts: simple but lose edits on refresh. Not selected because sessionStorage provides useful recovery without permanent persistence.

## Entry and editor behavior

Implementation choice: generate `/diapason/tune#tune=<existing payload>` links. Continue accepting existing `/diapason/#tune=...` links by routing them directly to the same ad hoc editor, preserving their payload and embed parameters. MIDI file import remains an explicit Library import.

Decode and validate using the existing portable-tune codec and limits. Invalid links show an error rather than importing anything or opening capture. Keep the fragment intact while editing; it always represents the original baseline. Loading and playback do not require IndexedDB writes.

Reuse the existing note-only editor, including pitch edits, mutes, melody settings, playback settings, undo/redo, named versions, exports, and sharing. Sharing exports the current working state directly rather than reloading it from IndexedDB; it does not implicitly Save. Existing note-only limitations, including absent original audio and frozen detection settings, remain applicable.

Place Save in the existing editor actions dropdown in both standalone and embedded ad hoc editors, available even before edits. It does not need a prominent standalone button. Do not show recording Delete or Duplicate actions for an unsaved tune. Full app navigation provides the exit/discard path. Embedded mode has no exit action; resetting musical edits remains available without creating a route to another tune. After Save, show normal recording actions except those that would escape the embedded tune, such as Delete followed by capture navigation.

## Temporary state and lifecycle

Store a versioned, JSON-compatible session draft keyed by the original tune payload. Include identity, current name, baseline identity, history with cursor and active gesture draft, and named versions. Use the existing history reducer and snapshot validation. Persist gesture updates and name/version changes synchronously so an unload cannot lose pending input; finalize any active gesture before Save or internal navigation decisions. Recover only drafts matching the requested baseline and supported schema.

Implementation choices: a fresh independent visit without a matching session draft starts at the URL baseline. Restoring a discarded link also starts at that baseline. Browser-created duplicated tabs may initially copy sessionStorage according to browser behavior, but then evolve independently. Corrupt drafts are reported and can be discarded to reopen the validated baseline. If sessionStorage cannot save, keep the editor usable in memory and show an explicit recovery warning; do not claim refresh recovery succeeded.

Dirty state covers meaningful changes to the name, musical state, or named versions relative to the URL baseline. Merely playing, selecting, panning, zooming, or creating undo history that returns to the baseline does not require an exit warning. Uncommitted meaningful gestures count as changes.

On internal navigation in full app mode, offer to stay or discard and leave. Staying retains all work; discarding clears the draft before navigation. An unedited exit also clears temporary state. A browser close, refresh, or external navigation uses the browser's native beforeunload warning when dirty; refresh can restore the session draft. Browser APIs cannot reliably distinguish closing from refreshing or clear state only after confirmed external navigation, so explicit discard is the guaranteed deletion path.

Implementation choice: migrate the production route setup from BrowserRouter to a data router (`createBrowserRouter` and `RouterProvider`) to use React Router navigation blocking for links, Back, and programmatic navigation. Preserve existing routes, base path, and StudioBoundary behavior.

## Save and recording history

Finish gestures and name edits, stop playback, and capture a consistent working state. Save the note recording, undo/redo history (including the original URL baseline and redo cursor), and named versions in one IndexedDB transaction under a fresh recording ID. Remap version ownership. This must not flatten edits into a new baseline or serialize only the current snapshot.

The recording editor must initialize from the saved history so Undo works immediately after redirect, including undoing changes made before Save. Implementation proposal: persist that history with subsequent edits so reopening the saved recording preserves this transferred history, extending the current session-only undo behavior for promoted tunes. Existing recordings without persisted history retain their current initialization behavior. Extend the editor save queue to capture full history/cursor alongside the commit and atomically persist them with the snapshot and editHead, including undo/redo and new branches. A schema migration is needed only if the chosen storage representation requires it.

Only after the transaction commits, clear the session draft, bypass the unsaved navigation warning for this transition, and replace the URL with `/recording/:id`, removing the tune fragment. Preserve embed configuration. Prevent concurrent Save submissions and edits during the transaction. Failed Save keeps the draft and current editor intact and exposes a retryable error; it creates no partial Library record.

If clearing sessionStorage fails after the transaction commits, still transition to the saved recording and report cleanup separately. Save has succeeded and must not be retried as a new recording.

## Embed constraints

Extend StudioBoundary to recognize tune routes and legacy tune fragments before its capture redirect. Implementation choice: add `tuneEmbed=1` alongside `embed=1` to the promoted recording URL to preserve the restriction across Save and refresh. The recording editor for that embed must not expose actions or redirects that lead to capture or the Library. Missing or deleted recordings show an inline error within the locked embed rather than redirecting to capture. General existing capture embeds continue to work as before. Saving must not open another window or change the parent page.

## Scope and verification

No backend, audio transfer, automatic import, autoplay, persistent localStorage drafts, or parent-window messaging protocol is needed. Preserve `/diapason/` and existing MIDI/WAV import behavior. Update README sharing and embed examples and history persistence details.

Follow-up requirement: extend `dev/embed.html` to demonstrate the editor embed using the user's supplied “Fly me to the moon” tune payload. Retain the existing recording showcase and resize/cross-origin controls; make the editor example readily accessible and generate its matching iframe snippet. Editor examples require no microphone permission.

Verify direct and legacy links, embedded links, malformed payloads, playback and edits without Library writes, refresh restoration, separate payloads, names and versions, undo/redo after refresh, explicit discard, canceled exit, browser unload registration, sharing current unsaved edits, Save without edits, atomic failure and retry, repeated Save prevention, transferred history after redirect and reopening, and embedded recording restrictions after Save. Run focused Vitest regressions and `npm run check`; obtain screenshots for visible changes if the available browser tooling permits.
