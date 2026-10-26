# Note editing investigation plan

**Superseded for implementation:** The discussion is consolidated in the [source-based note editing design](../specs/2026-10-26-note-editing-design.md) and [pitch-first implementation plan](2026-10-26-note-editing.md). This file preserves the investigation agenda; unchecked questions below are historical and do not override decisions in the design.

**Status:** Investigation and decision agenda. Manual pitch overrides automatic correction; a user-selected global octave shift also moves manually edited notes. Other recommendations below remain proposals, not approved behavior or an implementation plan.

**Goal:** Decide how manual note edits remain understandable, resettable, and recoverable as tuning changes the detected melody. Deliver pitch editing first, while leaving room for independent offset, duration, and velocity edits.

**Scope:** Business logic, persistence, note identity, processing order, and observable edit state. The eventual first UI needs only pitch up/down and pitch reset in the existing note menu, plus a visible edited indicator. Dragging, a redesigned editor, and implementing the other three axes are outside this first delivery.

**Agreed product boundary:** Prepare a MIDI melody for use in BandLab, where the user chooses instruments and produces the track. The planned note-editing axes are pitch, start time, duration, and velocity; pitch ships first. Channel automation, instrument/program changes, effects, expression curves, aftertouch, and release-velocity editing are outside the planned scope. The edit model does not need a generic framework for all MIDI messages.

**Timing:** BPM is fixed for this scope. Keep the existing seconds-based position and duration model; beats and seconds have a constant conversion. Tempo-change behavior does not need to be designed for this delivery.

**Agreed manual timing behavior:** Overlaps introduced by manual timing are allowed. Do not reject, snap, shorten, move neighboring notes, or otherwise repair a user's timing choice merely to eliminate overlap. The user can change or reset that timing. Playback and MIDI export must faithfully represent the chosen timing; overlapping same-pitch notes require an explicit output strategy because MIDI 1.0 does not provide distinct instance IDs for them.

**Agreed timing inheritance:** A split preserves the edited span's overall placement and length, dividing it at the proportional source split point. Use this as the starting rule for future timing axes; it must not block pitch-first delivery. Reliable edit mapping across timing and tuning is the priority.

## Agreed structural constraints

Manual edits are evidence of intended melody structure, not merely a final output overlay:

- If an edited note splits, all resulting pieces inherit its manual pitch.
- If one of two neighboring notes has been edited, automatic tuning must not merge the pair. Preserve their separating source boundary, even when their resulting pitches are equal.
- Detection must receive these constraints before merge decisions; matching edits to an unconstrained final sequence cannot enforce this behavior.
- Source constraints and output edits have distinct roles. A manually moved/resized note must not accidentally relocate its original acoustic evidence or protected source boundaries.
- Reset removes the selected axis's manual intent. When no edited axes remain on a note, remove the structural protection supplied by that edit as well: the note behaves as if it had never been edited, and automatic detection may split, merge, or remove it. Other independently edited notes retain their own constraints.
- Detection/filtering may make an edited note disappear. Keep its manual intent and source scope saved while inactive, and reapply them when matching source evidence returns. Structural protection prevents unwanted merges; it does not force a filtered note to exist or create a synthetic note in silence.
- Resetting one split child's axis removes that axis only from the child's source scope; the other child's inherited edit remains. Automatic reprocessing must not restore the removed portion. This requires independently resettable coverage rather than one indivisible shared edit record.

**Still to decide:** Exact boundary representation, whether outer boundaries of an edited span are both protected, and the persisted representation of independently editable/resettable child coverage. These must be settled before specifying the reconciliation algorithm. Do not feed manual pitch back into key/harmony inference merely because boundaries now constrain detection.

## What the code already tells us

- `src/melody/decode.ts` derives continuous-pitch `Segment` values from captured frames. Detection controls can shift boundaries, split segments, merge them, or remove them.
- `src/melody/interpret.ts` computes tuning, key, harmony, and named pitches from those segments. Its `decoded` notes precede rhythm processing; `notes` follow it. Both currently retain segment order and count.
- `src/recording.ts` combines those arrays into `NoteItem`. Its `id` is `index + 1`, a display number, not durable identity. Its `raw` field is a decoded, musically corrected note, not the original acoustic segment. In particular, `raw.midi` can change when the key or pitch controls change.
- Muting and selection use a midpoint and decoded MIDI pitch with a one-semitone tolerance. This supports some merges, but is insufficient as a guarantee for manual edits across changed pitches or octaves. Inclusive interval endpoints can also match adjacent notes at a boundary.
- `processRecording` is the shared route for editor results, previews, library playback, MIDI exports, and diagnostics. Manual edits should resolve here so those consumers agree.
- `Recording` persists in IndexedDB. Optional fields can support older recordings without changing the object-store schema, but exported diagnostics have a separate versioned replay contract.
- `useEditor.ts` stores selection separately and uses temporary processed results for auditions. `useMelodySettings.ts` debounces tuning saves. Edit writes must preserve current tuning state and vice versa.
- `playback.ts` adds the selected instrument's octave shift after note processing. README documents that this affects listening only; it does not change the roll or exported MIDI.

## 1. Settle what a pitch edit means

Compare these approaches using the same note and tuning changes before choosing a representation:

| Approach                     | Example: automatic C5, user clicks up, then tuning produces D5 | Tradeoff                                                                                             |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Relative semitone adjustment | C#5 becomes D#5                                                | Keeps the requested interval adjustment; later tuning can change the explicitly chosen sound.        |
| Absolute MIDI override       | C#5 stays C#5                                                  | Preserves the chosen note; later correction no longer changes its pitch until reset.                 |
| Pitch-class override         | C#5 follows the automatically chosen octave                    | Follows octave reinterpretation, but octave selection needs its own rule and another future control. |

**Agreed direction:** The user chooses an exact note, so a successfully matched manual pitch overrides automatic correction. However, an intentional global octave shift moves edited notes along with the rest of the melody. Store the chosen pitch in the melody's untransposed coordinate system, then apply the global shift downstream. “Absolute” describes its relationship to automatic correction, not immunity to explicit global transformations. Do not introduce multiple edit modes unless a concrete workflow needs them.

For example, automatic C5 (MIDI 72), manually raised to C#5 (73), stays at 73 if automatic correction later chooses D5 (74). A global octave setting of −2 makes that edited note sound C#3 (49), alongside the rest of the shifted melody. Returning the octave setting to zero restores C#5 without rewriting the saved edit.

- [x] Decide whether the user is correcting an exact musical note or requesting a lasting interval relative to automatic output: exact note before explicit global transposition.
- [ ] Work through C5 → C#5 manually, automatic C5 → D5, automatic C5 → C6, and switching back. Record the exact final MIDI value for each step.
- [ ] Decide whether an override that happens to equal the automatic result remains a deliberate pitch lock. Recommended: yes; only explicit reset removes it. Render metadata must distinguish “override exists” from “currently differs.”
- [ ] Decide what up then down means. With a pitch lock it returns to the starting pitch while retaining the lock; pitch reset resumes automatic behavior. Confirm that this distinction is acceptable.
- [x] Define reset as removing only the selected axis's manual intent, revealing the result under the **current** tuning, rather than restoring a historical note snapshot. Resetting the last edited axis also removes that edit's structural protection, restoring normal automatic behavior.

**Deliverable:** A pitch truth table and reset rules approved before implementation.

## 2. Define identity independently of editable values

Compare source anchors with persisted canonical notes and explicit split/merge lineage. Persisted notes offer stronger identities but would substantially change today's “derive everything from audio” architecture. Source anchors fit that architecture, provided ambiguity is represented honestly rather than hidden behind a best guess.

**Recommended starting point:** Give each saved edit its own stable ID and anchor it to immutable source evidence: original audio interval, with acoustic pitch as supporting evidence. Expose acoustic segment provenance through interpretation. Neither sequence number nor corrected MIDI pitch is the matching key. Edits must never move their source anchors when reapplied. Incorporate the agreed structural constraints into detection; an interval can pass its manual pitch to multiple split descendants, so a midpoint-only match is insufficient.

An edit ID identifies saved intent; it does not magically give every regenerated note permanent identity. A detected item may correspond to zero, one, or several edit records. Keep those relationships explicit, and retain the existing numbered IDs as display metadata.

- [ ] Choose interval units: source sample offsets or seconds with a defined half-open interval convention. Account for the final segment endpoint and future analysis-hop changes.
- [ ] Compare midpoint containment, interval overlap, and overlap plus acoustic evidence against the scenarios below. Choose exact eligibility thresholds, tie handling, and whether acoustic pitch can reject a match. Do not use a post-tuning pitch tolerance as a requirement.
- [ ] Distinguish the same acoustic evidence being named an octave higher from an acoustic detector octave error. Decide whether octave-related source pitch differences are acceptable matching evidence and how to avoid confusing adjacent notes.
- [ ] Define deterministic outcomes: applied, unmatched, ambiguous, or conflicting, with reasons. Reprocessing the same recording and settings must return the same resolution regardless of the tuning path taken to reach them.
- [ ] Decide selection behavior separately: it must follow the selected source through unambiguous changes; ambiguity must not silently select a different note.
- [ ] Evaluate whether existing mute anchors remain compatible alongside the new model or require migration. Preserve existing mute behavior unless a change is explicitly agreed and regression-tested.

**Deliverable:** A matching contract with exact numerical rules, fixtures demonstrating those rules, and a clear statement of what cannot be inferred safely.

## 3. Choose split, merge, and recovery policies

These are product decisions, not implementation details. Test them against real segmentation output as well as constructed intervals.

| Scenario                                          | Proposed behavior to evaluate                                           | Question to resolve                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Timing grid moves a note                          | Resolve from source; apply pitch to the moved output                    | No output-time matching.                                                                    |
| Key or pitch correction changes its name          | Retain the match and apply chosen pitch                                 | Confirm manual pitch wins even outside the new key.                                         |
| One edited note splits                            | Agreed: all resulting pieces inherit the manual pitch                   | Define how a later edit/reset on one child changes the inherited edit.                      |
| Edited note would merge with an unedited neighbor | Agreed: prevent the merge and preserve their separating source boundary | Define protected-boundary representation and enforcement.                                   |
| Two edited notes would merge, same target pitch   | Prevent the merge; equal pitches do not remove structural protection    | Confirm protection lasts while either note has a manual edit.                               |
| Two edited notes would merge, different pitches   | Prevent the merge and retain each note's own target pitch               | Detection must enforce constraints before producing the merged result.                      |
| Detection removes a note                          | Retain an unmatched edit without applying it elsewhere                  | Ensure it returns when the original evidence is detected again.                             |
| Tuning is changed and then restored               | Recover the original edit and resolution                                | No destructive rewriting of anchors during reconciliation.                                  |
| User edits an already merged/conflicted item      | Do not guess which earlier edit is being replaced                       | Decide whether to reject until resolved or explicitly replace all contributing pitch edits. |
| A conflict disappears after splitting again       | Reapply each original edit where unambiguous                            | Preserve distinct edit identities through the merge.                                        |

**Revised direction:** Enforce protected boundaries to prevent merges that would erase manual intent, and propagate pitch across splits of the edited source span. Retained, inspectable inactive edits remain a fallback for genuinely missing or ambiguous source evidence, not the normal response to a merge the engine should have prevented. Older saved data and later explicit structural actions may still require conflict handling.

- [ ] Approve each row, including exact examples and expected resolutions.
- [ ] Decide how users can inspect and reset unmatched/conflicting edits when there is no selectable note. A minimal recording-level list/reset mechanism may be necessary even while broader UI work is deferred.
- [ ] Define per-axis reset on a merged item with multiple contributors. Recommended: no implicit bulk deletion; expose which saved edit is being reset.

**Deliverable:** A complete split/merge/recovery policy with no silent loss of edits.

## 4. Fix processing order, reset boundaries, and octave behavior

Proposed first-release flow:

`captured frames + manual structural constraints → constrained source segments → automatic interpretation → rhythm shaping → resolve/apply manual pitch → mute filtering → consumers`

Source provenance travels alongside the automatic notes. Protected boundaries constrain segmentation, which can consequently change downstream inference. Separately, the chosen manual pitch is not directly fed back into tuning estimation, automatic key ranking, harmony, or neighboring-note correction in this proposal. Consider direct pitch feedback as a separate future capability: it would change more than the edited note.

- [ ] Confirm that changing a preset, key, pitch control, or resetting Tune preserves manual edits and recomputes their resolution. Pitch reset removes only that override; Tune reset retains it.
- [ ] Confirm that preset/key auditions resolve the same saved edits against the preview's own segments, without mutating saved edits or applied selections. Compare preview and committed results for the same settings.
- [ ] Choose how mutation controls behave during auditions. Recommended: disable edit/reset actions until the audition ends so an action cannot accidentally target a preview-only split or merge.
- [ ] Separate manual octave edits (12 semitones, affecting roll/playback/export) from the existing playback octave shift (listening only). No matching should use the shifted playback pitch.
- [x] Distinguish automatic octave reinterpretation from user-selected global octave shifting: automatic correction does not replace a matched manual target; an explicit global shift moves all notes, including manually edited ones.
- [ ] Define editing while a global octave shift is active: convert any chosen sounding pitch back to the untransposed coordinate system before persisting it, applying the shift exactly once. The current roll shows untransposed pitches, so establish whether its controls choose roll pitch or sounding pitch before implementation.
- [ ] Define valid manual pitches as integer MIDI 0–127, independent of the whistle detector's narrower analysis range. Proposed boundary behavior: disable/reject moves past an endpoint; do not wrap or rewrite saved intent by clamping.
- [ ] Check external MIDI playback with octave shifting at the MIDI endpoints and preserve the stored manual pitch regardless of output limits.
- [ ] Confirm muting keeps pitch edits intact; unmuting restores the edited pitch. Original WAV/audio stays unchanged.

**Deliverable:** One order-of-operations contract shared by all consumers, including preview and export.

## 5. Specify the smallest extensible data model

Only after the preceding decisions, draft exact TypeScript types and pure operations. Avoid storing a replacement `NoteEvent` snapshot: that would accidentally freeze timing when only pitch was edited.

- [ ] Specify a versioned persisted edit record containing its stable edit ID, immutable source anchor, and independent optional axis payloads. Implement only the pitch payload initially; record future axes in the design without speculative executable code.
- [ ] Specify pure operations to set/change pitch, reset pitch, and resolve edits. Define multiple writes to one edit, invalid inputs, and nonmutation guarantees.
- [ ] Specify how persisted manual spans produce protected segmentation boundaries and how split descendants inherit pitch. Define child-specific editing/reset and structural protection when one or all edited axes are reset.
- [ ] Test filtering out an edited child and then restoring it: its remaining edits return, while the reset sibling's removed coverage stays removed. Reloading or changing the order of tuning operations must not change this result.
- [ ] Prove that setting then fully resetting an edit yields the same processed melody and structural constraints as never editing under the same current settings. With other edits present, compare against a recording containing only those other edits. Do not leave a historical boundary lock or an active no-op edit behind.
- [ ] Expose automatic and effective notes, contributing edit IDs, edited axes, axes that currently differ, and resolution reasons. The renderer should consume this state rather than infer “edited” from color or note equality.
- [ ] Keep per-record unmatched/conflicting results available even when no visible item owns them. A boolean on `NoteItem` alone cannot represent these states.
- [ ] Walk through future offset and duration edits: source anchors stay fixed while output geometry changes; resetting pitch preserves other axes. Velocity needs a later `NoteEvent`/playback/MIDI contract because it is not a note field today.
- [ ] Test that manual overlaps survive final processing and export without automatic collision repair. Audit the existing MIDI encoder and playback scheduling for assumptions about ordered/nonoverlapping notes; define same-pitch overlap output behavior without changing the saved user timing.
- [ ] Specify reload, recording duplication, older-record defaults, save ordering with debounced tuning, and any needed validation of stored edit data.
- [ ] Decide diagnostics schema compatibility explicitly. Adding item metadata can break exact replay comparisons even with unchanged MIDI. Choose normalization of absent optional edit fields or a version transition, with old-schema fixtures either replaying successfully or being reported clearly as incomplete.

**Likely implementation boundaries:** A new pure `src/note-edits.ts` and adjacent tests; provenance in `src/melody/decode.ts` and `src/melody/interpret.ts`; persisted fields in `src/db.ts`; final resolution in `src/recording.ts`; selection/actions in `src/hooks/useEditor.ts`; minimal controls in `src/components/NoteDetail.tsx`; rendering metadata through `src/hooks/useEditorPlot.ts` and `src/trace.ts`; diagnostics/replay updates and README documentation. Confirm boundaries after the model is settled.

## 6. Turn decisions into a pitch-only implementation plan

- [ ] Collect constructed fixtures for every table row and use the existing whistle-intro fixture for realistic segmentation. Include adjacent equal-pitch notes, exact interval boundaries, competing anchors, no frames, complete filtering, octave reinterpretation, and repeated tuning cycles. Exercise real segmentation for split/merge tests, not just mocked note lists.
- [ ] Write an approved design document containing the chosen approach, exact matching constants, explicit alternatives/tradeoffs, and final behavior tables.
- [ ] Write a task-by-task implementation plan against that design: pure model and provenance, shared processing/persistence, then minimal editor integration and diagnostics. Each task gets concrete regression assertions and verification commands.
- [ ] Include assertions that unchanged recordings retain identical MIDI (including the approved Clean intro bytes), manual edits affect library/editor playback and MIDI equally, and diagnostic JSON/WAV replay reproduces final edited notes.
- [ ] Include integration cases for rapid up/down clicks, selection following pitch changes, reload/duplicate, editing alongside a pending tuning save, preview isolation, mute/unmute, axis reset, and inactive-edit recovery.
- [ ] Keep keyboard arrows' current selection meaning; initially put semitone up/down and explicit pitch reset in the selected-note menu. Add a simple edited marker based on model metadata; defer visual polish.
- [ ] Update README with shipped edit semantics and limitations during implementation. Run focused regressions and `npm run check` before submission; keep duplication/health baselines unchanged.

The investigation is complete when the pitch semantics, identity rules, all split/merge rows, reset behavior, preview behavior, octave behavior, and replay compatibility have explicit answers and corresponding acceptance cases. Implementation starts from those decisions, not from unresolved matching heuristics.
