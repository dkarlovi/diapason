# Source-based note editing

**Status:** Product rules agreed in discussion; technical choices below are proposed implementation decisions for review. Pitch ships first. This document supersedes unresolved alternatives in the investigation agenda.

## Intent and scope

Prepare an editable MIDI melody for BandLab. Support pitch, start/offset, duration, and velocity as independent axes over time; implement only pitch now. Keep original audio untouched. No channel automation, instrument programming, effects, expression curves, aftertouch, or release-velocity editing.

Prioritize reliable mapping across tuning, timing grids, splits, and temporary disappearance. BPM is fixed; keep seconds for source and output times. Preserve Node 22+, the `/diapason/` base path, local IndexedDB storage, and existing unedited MIDI output, including the approved Clean intro bytes. Add no dependencies and do not grow duplication/health baselines.

## Agreed behavior

- Manual pitch is an exact MIDI note before global transposition. It overrides automatic pitch correction, including automatic octave reinterpretation.
- Explicit global octave shifting affects edited notes along with all other notes. The existing playback octave remains playback-only; export/roll semantics do not change in this delivery.
- An override remains an edit even when its value equals the automatic result. Up then down retains the manual choice; explicit reset relinquishes it.
- A split passes the manual pitch to every resulting piece.
- Detection cannot merge an edited note with its neighbor. Equal resulting pitches do not remove this protection.
- Detection/filtering may remove a note from the current result. Keep the edit saved and restore its effect when the corresponding source returns; do not synthesize notes in silence.
- Reset removes only the selected axis over the selected source scope. Resetting one split child leaves the other child's intent intact. Tuning changes must not resurrect the reset coverage.
- When no edited axes remain over a scope, its own structural protection disappears. Other independently edited scopes retain theirs. Complete reset produces the same processed melody as never editing, under the same current settings.
- Manual timing overlaps are allowed without collision repair; the user can change or reset timing.
- For future timing edits, preserve the edited span's overall placement and length through splits and map the internal boundary proportionally. This starting rule must not block pitch delivery.

## Approaches and chosen direction

Relative pitch deltas would allow later automatic correction to change a user's chosen note; pitch-class locks would similarly allow automatic octave changes. The agreed choice is an exact pitch before explicit global transformations.

Post-processing anchors alone cannot stop merges. Persisting a complete canonical note sequence would replace the current audio-derived architecture. Use saved source scopes that constrain segmentation and supply final axis overrides. Automatic splitting does not write new records; only explicit edits/resets modify saved scopes.

## Source identity and persisted intent

**Technical choice:** Source coordinates are half-open intervals in recording seconds, taken directly from analysis-frame boundary timestamps. Keep source `end` explicitly; do not reconstruct it from output duration. The recorded analysis settings and source timeline remain fixed in this delivery; reanalysis on a different hop grid/audio replacement is outside scope.

```ts
interface SourceRange {
  start: number;
  end: number;
}
interface PitchEdit {
  id: string;
  ranges: SourceRange[];
  midi: number;
}
interface NoteEdits {
  version: 1;
  pitch: PitchEdit[];
}
```

Add optional `Recording.noteEdits`. Missing data means no manual edits. IDs identify saved intent, not a detected sequence index; generate them only on explicit writes. Source scopes stay in the original timeline even when output timing or pitch changes.

Maintain these invariants: finite `0 <= start < end <= durationSec`; sorted nonoverlapping ranges within a record; no overlap between pitch records; integer MIDI 0–127; unique nonempty IDs; no empty edit records. Invalid versioned data must be reported clearly rather than silently dropped. Do not add fields or executable code for the three future axes yet.

Setting pitch over a source range subtracts that range from existing pitch records, retaining untouched fragments and their IDs, and creates a new record for the chosen range. Reset subtracts the range without adding a replacement. Drop records whose coverage becomes empty. No change to another axis's coverage is implicit. Do not coalesce neighboring independent edit records merely because their values agree: their shared boundary remains meaningful.

Example: edit `[0, 2)` to MIDI 73. Detection later splits at 1; both children inherit 73 without changing saved data. Reset `[0, 1)` and the original edit retains only `[1, 2)`. Filtering everything out and restoring it must not restore coverage over `[0, 1)`. Setting the left child to MIDI 75 creates separate intent over `[0, 1)`; the right remains 73.

## Structural constraints and deterministic resolution

Derive protected boundaries from both ends of every currently saved range across edited axes (pitch only in v1). Protection is derived data, never a separately persisted historical lock. This also protects the two outer boundaries of an edited note. Reset therefore releases only boundaries no longer needed by remaining saved coverage.

Pass boundaries into `segmentMelody` before pitch segmentation and slip absorption: form voiced/articulated pieces as today, cut them at protected boundaries, then run pitch-change detection and slip absorption independently inside each piece. Minimum-duration and level/silence filtering still apply. Never merge across a protected cut. With no boundaries, retain the existing algorithm and exact output.

Expose each segment's source interval separately from its decoded/quantized output note. All saved boundaries originate on the same fixed analysis timeline as regenerated segments. A visible segment is either fully inside exactly one saved pitch range or outside every range; containing ranges provide its override. No fuzzy matching on pitch, output timing, or sequence ID is needed. Exact boundary contact has zero overlap and does not transfer an edit to the neighboring segment. A segment crossing saved coverage is an invariant violation to surface in tests, not a reason to choose an approximate match.

Keep a per-edit summary of the ranges currently represented by visible segments, so fully/partially inactive coverage is inspectable. Processing is pure: no ID generation, coverage changes, or saves. Given the same source, edits, and settings, results are identical regardless of the sequence of tuning previews/changes used to reach them.

## Processing and consumers

`frames + protected boundaries → source segments → automatic interpretation → rhythm shaping → manual pitch → mute filtering → consumers`

Structural constraints can indirectly change downstream tuning/key/harmony inference through segmentation. The chosen manual pitch itself is not fed back into inference. The effective pitch updates both MIDI number and name; timing remains automatic in the first release.

`NoteItem` keeps its existing sequence `id`, `raw`, and `muted` compatibility fields. Add `source`, `automatic` (the rhythm-shaped pre-edit note), and `editState` containing contributing IDs, edited axes, and axes currently differing from automatic output. `note` remains the effective result. Keep diagnostics, library/editor playback, MIDI export, and preset/key auditions on `processRecording`.

Muting retains manual edits and structural protection. Keep existing persisted mute anchors and behavior in this release; do not opportunistically migrate them into the new model.

## Selection, controls, and persistence

Use a source-time reference point for selection, never corrected MIDI pitch. On a split, choose the child containing that point under half-open containment; if no child contains it, clear the visible selection without deleting edits. Select a note with its source midpoint and retain that point through pitch changes. Sequence numbers remain display labels.

Add Up one semitone, Down one semitone, and Reset pitch to the existing note menu. They target the currently selected source range using the current effective untransposed pitch. Disable moves past MIDI endpoints; do not wrap. Roll pitch stays untransposed even when playback octave is active; the audition uses the downstream octave shift exactly once. Preserve arrow-key selection behavior.

Mark edited notes on the roll using explicit metadata, including overrides equal to automatic pitch and edited muted notes. Preserve selection and sounding-note indicators. Show a compact count of inactive saved pitch edits; provide an explicit recording-level Reset all note edits action with confirmation so hidden edits can be removed. Per-note Reset pitch requires no confirmation. Tune reset never clears manual edits.

During a tuning audition, disable pitch mutation/reset controls (including bulk reset) and leave the applied selection anchor unchanged. Preview and commit of the same settings use identical saved constraints and edits, but previews never save.

Apply mutations to the latest `recordRef` and persist through the existing recording write path. Pending debounced tuning saves must use the latest record, preserving edits; pitch edits must preserve pending tuning settings. Copies retain the independent saved edit data; edits to either recording cannot mutate the other. Leave the IndexedDB object-store version unchanged.

## Contract for the remaining axes

Future axes have their own coverage and reset; any nonempty axis coverage protects boundaries. Scalar velocity passes unchanged to split children. Timing requires an immutable reference span and output mapping, rather than copying absolute child starts/durations. A parent source interval `[s, e)` mapped to output `[a, b)` maps an internal source point `x` to `a + (x - s) * (b - a) / (e - s)`. Restrict this same mapping to descendants; never repeatedly rescale after every tuning change.

Offset-only edits preserve chosen placement while automatic duration remains free; duration-only edits preserve chosen length while automatic placement remains free. When both are manual, both constrain the output mapping. Per-child reset removes only that child's axis coverage and does not alter the other child's mapping. Preserve reference data on surviving scopes. These are architectural requirements for later axes, not additional first-release code.

Allow final overlaps. The current MIDI encoder rejects overlaps; a later timing delivery must update scheduling/export and address overlapping same-pitch instances without changing stored timing. This is not required for pitch-only delivery because automatic timing remains unchanged. No promise of arbitrary same-pitch MIDI 1.0 overlap fidelity is made by this pitch release.

## Diagnostics and verification

**Technical choice:** Export diagnostic schema 4 for explicit source provenance, constraints, saved edits, resolution summaries, and pre-/post-edit notes. Increment the pipeline version to 4. New JSON/WAV pairs must replay exactly, including edited results and MIDI bytes. Report schema-3 and older snapshots as incomplete older-pipeline evidence rather than claiming exact new-schema replay; keep original fixture files untouched. Older saved browser recordings continue to work with no edits.

Test real segmentation, not just fake note lists. Required scenarios: split inheritance; protected merges with one or both neighbors edited, including equal pitches; partial reset; last-axis reset equivalence; filtering then recovery; absent frames; boundary contact; tuning order independence; key/mode/pitch changes; timing grid/swing movement; MIDI endpoints; mute/unmute; octave playback; rapid writes; preview isolation; reload/duplication; diagnostics replay. The approved Clean intro must remain byte-identical.

Run focused tests while implementing, then `npm run check` before submission. Review/update README to describe actual shipped behavior and limits. No application code is changed by this design.
