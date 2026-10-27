# Editor commits, undo/redo, and version tags

Status: approved on 2026-10-27, including the user-facing terminology clarification.
This specifies behavior, not an implementation plan.

## Terminology in the product

The UI calls named saved states **versions**. Use "Save version", "Versions",
"Restore version", "Rename version", and "Delete version" in visible text,
accessible names, confirmations, notices, and user documentation. "Tag" is internal
design terminology only; users do not need to know Git terminology. New public
application APIs and storage entities should prefer version-oriented names too.

## Intent and agreed model

Make editing safe to explore: undo small completed actions in the current session,
and name states worth keeping for future sessions. Editing never changes the
captured audio.

The user's terminology and requirements:

- A **commit** creates an editing state. Completing another change creates another
  commit; undo/redo walks those commits during the active session.
- A **tag** names a specific committed state. A named version is a tag, and only
  manually saved tags pin states against cleanup.
- Untagged historical states cannot be recovered after the session ends.
- Automatic checkpoints still happen as commits at completed actions, but do not pin states.
- The existing scoped Undo tuning action disappears into global undo/redo.
- Reset remains "back to default" and can itself be undone.
- A continuous gesture commits once: dragging a slider from 3 through 4, 5, and 6
  to 7 records the transition from 3 to 7, not its intermediate values.

The latest committed working state continues to autosave. Losing session history
does not reset the recording to its last tag. The current working state is saved
even when it has no tag; its previous untagged states expire.

## Approaches and direction

We considered session snapshots, permanently retaining every revision, and manual
versions without automatic history. The agreed direction is one commit model with
session traversal and manually named tags. Permanent fine-grained history conflicts
with the requested retention rule; manual versions alone omit automatic commits.

Use complete snapshots of editable intent rather than commands that must be
replayed or inverted. A tag refers to a commit, but the saved commit must remain
restorable without its parents. Audio is shared rather than copied per commit.
This storage choice is proposed, not a user requirement.

## State covered by a commit

Commit the complete musical editing intent together:

- Melody preset, explicit knob overrides, and key choice.
- Manual pitch edits, including edits currently inactive under the chosen settings.
- Muted-note anchors, including anchors currently matching no note.
- Playback instrument and octave.

Preserve explicit overrides, not just the values they currently resolve to: an
explicit override equal to today's default can behave differently after another
preset is selected. Preserve the distinction between absent and present optional
fields where legacy setting resolution depends on it. Older recordings must undo
back to their original effective settings without unintended migration effects.

The following are outside musical history: audio, capture/provenance metadata,
waveforms, analysis frames, selected note, viewport, layout, playback position,
hardware output selection, and auditions.

Proposed scope: recording name is library metadata, saved separately and preserved
when undoing edits or restoring a tag. Tags have their own names. Recording deletion
and duplication are library operations, not undoable musical edits.

## Editing transaction and commit events

Use explicit application-level begin/update/commit/cancel events. React rendering
and persistence debounce are not commit boundaries.

1. **Begin:** capture the current committed state as the transaction's baseline.
2. **Update:** display and audition a draft state without appending history or
   saving intermediate values as the working state.
3. **Commit:** if intent changed, append one immutable commit containing the final
   snapshot, action label, ID, and timestamp. Make it current and autosave it.
4. **Cancel:** discard the draft and restore the baseline, without creating a commit.

Discrete actions perform begin/update/commit as one operation. Only one editing
transaction can be active at once. Finish or cancel it before another operation
can create a commit. Finishing at the baseline creates no commit and preserves redo.

| Interaction                                              | Commit boundary                                                  | Cancellation                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| Pointer/touch slider drag                                | Release: one commit                                              | Escape or pointer cancellation restores baseline         |
| Selected-note pitch drag                                 | Release: one commit                                              | Escape, cancellation, or second finger restores baseline |
| Keyboard slider adjustment                               | Key release; repeated keydown events while held form one gesture | Escape restores baseline                                 |
| Pitch stepper                                            | Each activation is one commit                                    | No draft                                                 |
| Preset, key, instrument, octave, or discrete knob choice | Explicit Use action                                              | Preview alone creates no commit                          |
| Reset a control                                          | One commit restoring that control's default                      | No draft                                                 |
| Reset tuning controls or all note edits                  | One commit for the whole reset                                   | Existing confirmation may cancel before the action       |
| Mute/unmute a note                                       | One commit                                                       | No draft                                                 |
| Restore a tag                                            | One commit containing the tagged intent                          | Preview alone creates no commit                          |

For sliders, a track click is one gesture too. Keyboard editing commits on focus
loss if key release was missed. Normal navigation away finishes a pending control
edit before saving; explicit cancellation rolls it back. Abrupt tab/process loss
may discard an unfinished gesture.

A reset changes only its existing scope: a knob returns to its current preset
default; tuning-controls reset retains the preset and key; pitch reset removes the
manual pitch override; reset-all-note-edits removes active and inactive pitch edits.
Undo restores the exact preceding intent. Reset already-default intent is a no-op.

## Session history and undo/redo

Proposed session boundary: opening one recording in the editor until that editor
is left, the recording changes, or the page reloads/closes. Merely switching browser
tabs, hiding Tune, pausing playback, or backgrounding the page does not end it.
Each browser tab has its own active session.

- Opening creates a baseline from the latest saved working state. Undo starts
  disabled; tagged states are available separately.
- Successful commits append to chronological session history. Every session commit
  stays traversable until session end; there is no silent pruning during a session.
- Undo moves to the preceding state; redo moves to the following state. Traversal
  does not append commits. Both autosave the newly current working state.
- A changed commit after undo drops the forward redo path. Tags on that path survive.
- Undo during an unfinished gesture first cancels that gesture, without also walking
  backward. The next Undo walks committed history. Redo is unavailable while a
  transaction is unfinished.
- Traversal stops playback/auditions. Preserve selection using its source-time
  anchor if a corresponding note exists; otherwise clear it. Do not rewind zoom.
- No-op actions, cancelled gestures, previews, and UI navigation create no commits
  and do not destroy the redo path.

Provide global Undo and Redo controls outside Tune so they are reachable while
editing notes. Disabled states reflect history availability. Accessible labels
identify the pending action, such as "Undo reset pitch". Support Ctrl/Cmd+Z,
Ctrl/Cmd+Shift+Z, and Ctrl+Y. Leave native text editing undo alone when a text field
or editable text region has focus. Visible controls also support touch users.

Example: baseline A; slider commit B; mute commit C; reset commit D. Undo visits
C, B, A; redo visits B, C, D. From C, making edit E replaces D in the redo path.
If D was tagged, that version remains available independently.

## Automatic checkpoints

In this model, an automatic checkpoint is the state captured by an automatically
created commit at a completed action. Users do not press Commit after every edit.
There is no separate timer-based milestone layer: completing a gesture captures
its final state and makes it traversable immediately. Naming that state with a tag
preserves it across sessions.

This interprets the earlier automatic-checkpoint requirement using the user's
latest commit/tag terminology. Automatic retention of older untagged states across
sessions would be a separate feature and would change the agreed retention rule.

## Manually saved tags

- Save version names and pins the current committed state. It does not change
  musical intent or add a duplicate editing commit.
- Proposed naming rule: trimmed, nonempty, case-insensitively unique per recording.
  Duplicate names prompt correction rather than silently replacing an existing tag.
- Multiple differently named tags can refer to the same state.
- Saving a tag first finishes any pending gesture and stops an audition, so the
  state saved is the applied state rather than an unapplied preview.
- A tag is immutable in its target. Its display name can be renamed. Reusing a
  version name requires explicitly deleting or renaming the previous tag.
- List tags with name and creation time. The user can audition, restore, rename,
  and delete them. Restore applies the entire musical snapshot while retaining
  recording metadata, and creates a normal undoable commit if intent differs.
- Restoring does not move or overwrite the tag. Subsequent edits do not modify it.
- Creating, renaming, and deleting tags are version-management actions, outside
  musical undo/redo. Tag deletion asks for confirmation and does not change the
  current musical state.

## Persistence and retention

Keep the recording's latest committed working state, all tags, and their target
snapshots in IndexedDB. Keep fine-grained history in session memory.
Reloading can therefore never expose discarded untagged history,
even following a crash. Persist no draft state as a completed commit.

At session end, discard the undo/redo graph. Keep the latest
saved working state and every tagged snapshot. A tag needs no retained ancestor
chain. Deleting the last tag on a historical state permits its snapshot to be
collected unless it is also the current working state or still used by the active
session. Do not delete active session states merely because their tag was removed.

An existing recording without history opens normally. Add versioned snapshot data
and any needed IndexedDB stores through a backward-compatible migration. Store
audio once; neither tagging nor undo should copy it or redo audio decoding/analysis.
Recompute derived notes from the selected intent and existing frames.

Coordinate all editing saves through one persistence boundary, replacing the
independent melody timer and immediate edit writes. Save a working-state update and
its durable identity together; save tag metadata and its snapshot atomically.
Database success means transaction completion, not only request success. Prevent
older queued saves from overwriting newer undo/redo outcomes. Preserve unrelated
waveform backfill and metadata writes rather than restoring whole stale recordings.

If a save fails, keep the in-memory state and history, show an unsaved status, and
allow retry. Do not claim a tag is saved before its transaction completes. Normal
navigation flushes pending commits; abrupt closure can only guarantee states whose
transactions have completed. No reliance on an asynchronous unload handler.

Proposed multi-tab scope: concurrent editing of the same recording is unsupported
in this iteration. Do not merge session histories or imply cross-tab undo. Decide
the minimal enforcement or conflict notification during implementation planning;
silent overwriting of another tab's newer tagged data is unacceptable.
The user subsequently specified compare-and-swap: each save identifies the saved
state it expects to overwrite, and fails if that state no longer matches. Compare
and write happen atomically. A revision token must also distinguish repeated
visits to the same commit through Undo/Redo; a commit ID alone is insufficient.

Duplicate creates a new recording from the current working intent, with no inherited
tags or session history. Deleting a recording deletes its tags and retained snapshots
in the same operation. Library storage estimates include version data.

## Compatibility and non-goals

- This is a local edit-history feature, with no server or new runtime dependency.
- Tags save editing intent, not rendered MIDI/audio or a frozen processing engine.
  Future engine/default changes can change the audible result of an older tag.
- Existing WAV export continues to exclude editor state. Exporting/importing tags,
  project archives, cross-device sync, collaborative editing, merging, visual branch
  trees, and comparing versions are outside this iteration.
- No automatic durable versions: only manually named tags preserve older states
  across sessions. The latest working state remains durable regardless of tags.
- Update README when implementing the feature to explain commit boundaries,
  session lifetime, resets, tags, and local retention. Preserve the /diapason/ base.

## Acceptance scenarios

1. Drag 3 to 7 through intermediate values: the roll updates live; one Undo returns
   to 3 and one Redo returns to 7. A drag back to 3 adds nothing.
2. Cancel a slider/note drag: no save or commit occurs and redo remains available.
3. Change a slider using keyboard repeat: one held-key gesture creates one commit.
4. Apply a preset, edit pitch, mute, and reset controls: Undo reverses each in order,
   including restoring the pre-reset custom settings; Redo reconstructs each result.
5. Reset all note edits: one Undo restores active and inactive pitch intent exactly.
6. Preview a choice, select notes, pan, and zoom: history and saved intent do not change.
7. Undo and make a new edit: old redo disappears; tags on discarded commits survive.
8. Save tag T, edit further, and reopen: latest saved edits and T survive, but earlier
   untagged states and redo do not. Restoring T is undoable in the new session.
9. Automatically commit an edit, then make another edit and reopen: the earlier untagged state is unavailable
   unless manually tagged; the latest saved working state still opens.
10. Tag during a draft or audition: finish the draft, stop the audition, and save only
    the resulting committed applied intent, with no intermediate states.
11. Undo or restore rapidly while saves are pending: reopen at the last successfully
    saved current state; an earlier save cannot overwrite a later successful one.
12. Simulate transaction abort/quota failure: display unsaved status, retain session
    recovery, and never display an unsuccessfully saved tag as durable.
13. Open a legacy recording, change settings, and Undo: effective legacy intent is
    restored without losing metadata, mute anchors, or inactive pitch edits.
14. Duplicate or delete a recording: follow the stated tag ownership/lifecycle rules.

## Proposed calls to review

The model and retention rules above are user decisions. These details are proposals:
session ends on leaving the editor; names stay outside musical history; each held
slider key is one gesture; automatic checkpoints map directly to commits; immutable tag
targets with unique names; tag management outside musical undo; duplication starts
without tags; no concurrent editing support. Exact UI layout, transaction API,
storage schema, conflict enforcement, and action-label wording remain builder choices.
