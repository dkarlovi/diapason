# Editor layout studies

Run `npm run dev` and open
<http://localhost:5173/diapason/prototypes/editor-directions.html>.
The tabs switch between three standalone, throwaway interaction prototypes.
The studies stay isolated from saved recordings. The approved shared-timeline
overlay direction is now implemented in the live Editor.

The selected **B · Shared timeline** is now the default. Its Play and Download
buttons have identical sizes, order, and top-right offsets on both tracks.
Play becomes Stop in place. A handle straddles the audio/MIDI divider to hide or
restore the original track; mobile starts with original audio hidden. The MIDI
canvas reaches the workspace edges, with no separate transport or navigation rows.
Zoom floats at bottom right, and panning appears there only while zoomed in.
Instrument and octave sit beside presets and key in the right-hand toolbox.
Download log is in the header's Recording actions menu. These downloads remain
illustrative, with no file export from the study.

Tune starts at 360px on desktop. Drag its left divider between 286px and half
the workspace, or focus the divider and use Left/Right, Home, or End. The Overlay
button floats Tune over the full-width workarea; Dock restores the sidebar layout.
Both tracks' playback controls stay accessible in either placement. Mobile uses
a floating panel below the MIDI transport.

Preset previews draw the auditioned demo notes on the roll and show **Playing
preview · [preset] · Not applied**. Sounding notes are highlighted. The regular
MIDI Stop button also stops previews and restores the applied melody. Time zoom
follows the playhead, including when playback starts outside the current viewport.
Both tracks pan together. Overlay playback follows within the uncovered canvas.

The studies borrow the recording screen's compact header, Slate & blue themes,
canvas overlays, and single-button playback. They have no wizard, permanent
preset grid, separate note-list panel, or recording-settings toolbox. Rename is
in the header; secondary recording actions belong in its overflow menu.

| Direction                        | Space and controls                                                                                                          | Tradeoff                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · Asymmetric studio (`#split`) | Original on the left at 25%; MIDI at 75%. Original can expand to half. Tune opens a shallow shelf with grouped controls.    | Familiar continuity with capture; the shelf still reduces note height in short windows. Audio and MIDI share the visible time interval but have different pixel scales. |
| B · Shared timeline (`#tracks`)  | Shallow original track above a large piano roll. Tune opens a sidebar. Both tracks share time positions, zoom, and panning. | Best timing comparison and a good starting point for the final design. The original moves above the roll; the inspector reduces horizontal space.                       |
| C · Canvas first (`#focus`)      | MIDI fills the workspace. Original opens a comparison tray; Tune opens a floating inspector.                                | Most uninterrupted room when tools are closed. Open trays cover notes and require more dismissal.                                                                       |

All directions start fitted to the melody's pitch range. Time zoom, panning,
whole-take reset, pitch zoom, and Fit notes work. Presets are grouped in one
dropdown with separate Preview and Use actions. Use resets study controls;
changing a control marks the preset Custom. Tune groups Essentials, Pitch,
Rhythm, and Detection without implying an order or a sequence of steps.
Instrument and playback octave live in B's toolbox; A and C retain their original
transport arrangement for comparison.

Click or keyboard-activate a note to audition it and show a compact contextual
readout. Mute and Hear in context belong there. Ctrl/Cmd+click toggles mute.
Escape closes temporary controls and restores focus. The sample piano-roll
notes are keyboard focusable, exploring a replacement for the current Notes list
without removing keyboard access to individual notes.

The page supports light/dark themes, desktop and narrow layouts. On narrow
screens A stacks original above MIDI; B and C use floating tuning tools.

## Prototype boundaries

The melody, pitch trace, tempo, and recording name are examples. Sound is generated
with Web Audio, including a whistle-like reference. Preset previews demonstrate
audition/stop behavior; a few include an illustrative change in pitch or length.
The roll and synth use the same illustrative preset changes; they do not reproduce
the production correction engine. Tuning and key controls demonstrate disclosure
and state but do not recalculate notes. The key menu is
representative; the final editor needs all keys and previewable alternatives.
Playback instrument and octave affect the generated MIDI audition. Playback,
muting, and view navigation work; there is no library persistence, recording
deletion, diagnostics, external MIDI connection, or MIDI/WAV export here.

The `.mid` control and overflow menu show where existing capabilities would
live. Use the live app for actual recordings and downloads. Prototype HTML is
served by Vite during development and is not an entry point in the production
build.
