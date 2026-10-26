# Note Inspector and Edit Marking Plan

**Goal:** Make edited notes visible on the roll and replace the note popover's mixed controls with one property-inspector layout that scales to future position, duration, and velocity edits and works on phones.

**Status:** Implemented on the `note-inspector` branch, 2026-10-26. Steppers that land back on the detected pitch clear the edit (agreed during review).

**Scope:** Steps 1–3 of the note-editing UX roadmap. No change to the saved `NoteEdits` format, no drag editing, no new edit axes. Add no dependencies.

**Decisions (agreed 2026-10-26):** bold diagonal stripes on every edited note (gray stripes on muted notes; outlines stay reserved for selection), plus a ghost of the automatic note and a tether to the edited position; inspector reuses the Tune panel's heading / category-rail / control vocabulary; bottom sheet on portrait phones; touch drag will edit only the already-selected note (later step); plan steps 1–3 now.

## Principles

- One mark means "you changed this": striped notes on the roll, and a matching marker beside each edited inspector row. It is a pattern, not a new hue, so it survives grayscale and leaves the semantic colors alone.
- The inspector never changes size: every row has the same anatomy and reserves its reset slot; toggles keep a fixed width.
- Identity appears once. Rarely used actions go to an overflow menu.
- An override equal to the automatic pitch still counts as edited (`editState.axes`) and is striped; the ghost and tether appear only when the value differs (`editState.differingAxes`).

## Step 1 — Edit marking on the roll

- [x] `trace.ts`: remove the `•` glyph. Fill edited notes with a 135° stripe pattern (`ctx.createPattern` from a small offscreen tile): equal-width bands of `colors.note` and a 40% note/card mix, about 4px each. Muted edited notes use a gray (label-color, ~35%) stripe inside the dashed outline. Playback (sounding) fill overrides the pattern.
- [x] Add `origins?: { from: NoteEvent; to: NoteEvent }[]` to `TraceView`: for each edit that differs from the automatic note, a dashed outline at the automatic pitch/time plus a dashed tether from it to the edited note, faint for unselected notes and full strength for the selected one. Draw beneath the notes. Pinned (equal) edits get stripes only.
- [x] `useEditor`: build `origins` from items with differing axes (`automatic` → `note`); thread through `useEditorPlot`.
- [x] Tests: canvas-call assertions for the stripe fill (edited, muted+edited, sounding override) and for origins (differing edits only; selected at full opacity).

## Step 2 — Inspector layout (Pitch row only)

Rebuild `NoteDetail.tsx`:

```
┌ heading band (darker, one line) ──────────┐
│ #2 · A4   1.25 s · 0.50 s     ▶   🔇   ⋯  │
├ body (neutral) ───────────────────────────┤
│ ▨ Pitch    [−]    A4    [+]     ↺         │
└───────────────────────────────────────────┘
```

Mirror the Tune panel's tonal split: a darker band on top (like the Essentials/Pitch/Rhythm rail), controls on the neutral surface below. Header buttons use the standard secondary button (card fill and border, like the canvas Play), slightly larger than the steppers (30px vs 28px on desktop); pressed uses the blue tint (primary text, border and `--color-primary-muted`), running uses the amber playback tint. The only borderless control stays the reset icon. Steppers use a darker filled, bordered style (like Tune's dropdowns) so they stand apart from the neutral body and from the quiet `editor-reset` icon.

- [x] **Heading band (one line):** `#<id> · <name>`, start and duration in secondary tabular text, then fixed-size secondary icon buttons: Play in context (Play/Stop icon, amber running state, accessible name and tooltip follow the action), Mute (`Volume2`/`VolumeX`, constant name "Mute note", `aria-pressed`, blue pressed tint; keep the `M` shortcut), and ⋯. Remove the separate info row.
- [x] **No overflow menu:** Copy ID is removed; while Pitch is the only row, its Reset covers the note. Bulk reset stays in Recording actions.
- [x] **Property row component** (`NoteProperty`): label, − button, value, + button, reset slot. The reset is an icon button (`RotateCcw`, same style as Tune's `editor-reset`) that always occupies its slot and is hidden with `visibility` when unedited. A small stripe swatch is shown before the label when edited. Use a CSS grid with fixed columns so rows align.
- [x] **Pitch row:** − / + shift by a semitone (names "Down one semitone"/"Up one semitone"), value shows the note name, reset is "Reset pitch". Remove the "Pitch edited" span; the swatch plus `aria-describedby` "Edited" text carry the state.
- [x] Keep the `canEditPitch` and 0–127 disabled rules.
- [x] Update `Editor.loaded.test.tsx` for the new names; add regressions: toggling mute and editing pitch do not change the popover's rendered structure (same buttons present), and Copy note ID lives in the overflow.

## Step 3 — Mobile container

- [x] At `max-width: 760px` in portrait, render the same content as a full-width sheet docked to the bottom of the roll instead of the anchored popover. Use the shared popover primitive with an alternative content class, or a plain positioned panel with Escape/outside-tap handling matching the current behavior.
- [x] Short landscape: phones in landscape are wider than the 760px breakpoint and keep the anchored popover, which fits with a single property row.
- [x] Touch targets of at least 44px inside the sheet; desktop keeps the compact 27px controls.
- [x] When a note is selected under the sheet's area, pan pitch so the note stays visible above it.
- [x] Keep the selection outline anchor on the note in both containers.
- [x] Tests: viewport-width-driven render picks the sheet class; Tune and inspector are mutually exclusive on mobile.

## Docs and validation

- [x] Update `README.md` (the note details section around lines 355–360) and the "Floating tools and menus" section of `DESIGN.md` to describe the inspector, striped edited notes, and the origin ghost and tether.
- [x] Verify rendered light/dark at desktop, 390×844 portrait, and 844×390 landscape.
- [x] `npm run check`.

## Later (not in this plan)

4. Note-edit undo (Ctrl+Z and a button), required before drag editing.
5. Pitch drag (mouse body drag; touch drag starting on the selected note), ↑/↓ and Shift+↑/↓ shortcuts, audition on pitch change, ghost plus live readout while dragging.
6. `NoteEdits` v2 with timing coverage, then Start/Length rows, horizontal drag, and right-edge resize.
7. Per-note velocity (currently one global value, 96).
