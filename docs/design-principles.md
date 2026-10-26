# Studio design principles

Agreed direction: **Slate & blue**, professional and restrained, with light and
dark themes following the system preference. The redesign focuses on appearance
and interaction; the existing feature set stays broadly the same.

## Typography

Use a comfortable reading scale: 16px equivalent body text, 14px controls and
field labels, and 12–13px secondary information. Define sizes in rem units.
Compact layouts should retain readable controls rather than shrinking their
text to fit. This is a design choice; WCAG does not prescribe a minimum pixel
font size. Verify text resizing and contrast separately before implementation is
considered accessible.

## Workstation header

Recording and editing use one compact header with the app identity, a Library
link, the current screen or recording name, and MIDI output. Do not repeat the
current name as both a breadcrumb and a separate page title. Start the workspace
directly below this bar. The Library can retain a larger page heading.

Show setup values where they are established. Do not put microphone, tempo, or
recording metadata in a setup subtitle before those values are known. Keep
operational information with its chart or setup control.

## The canvas is the work

The live signal is the primary feedback during recording setup. The wizard helps
the user bring that signal into a recordable state. Keep the live view visible
through every setup step and throughout recording.

The saved editor uses the approved shared-timeline overlay direction. Original
audio is a shallow track above an edge-to-edge MIDI roll, with exactly aligned
time coordinates. Original audio can be hidden entirely and starts hidden on
mobile. A handle straddles the divider to hide or restore it.

Both tracks share matching Play/Stop and Download controls in the same order and
at the same top-right offset. Download is the primary tool action, with a visible
label. Play is secondary preview: labeled on desktop and icon-only on small
screens so Download keeps its label. Open Tune moves both pairs left together
so playback remains accessible. Tune overlays the workarea, starts at 360px, and
can be resized from 286px to 50% using its divider or keyboard. Zoom and pan float
at bottom right; metadata and note details are overlays, never dedicated rows.

## Controls are a toolbox

The recording wizard and editor controls share a visual language: panel framing,
headings, fields, spacing, status, and action hierarchy. Controls support the
canvas and must not push it out of the viewport as their content grows. Input
settings belong in the setup toolbox, not in a separate scrolling panel below
the live signal.

The live signal communicates pitch, level, clipping, and input health at a
glance through clear visual indicators. Recording must not require reading
instructions or inspecting a settings list. Show the input level horizontally
below the chart. New signal enters near the right edge; the chart always follows
it. Do not add follow switches or optional display toggles. Keep the live view
free of checkbox-like status controls.

Record appears only in the final wizard step, after setup is complete. The same
button stops an active recording. Keep that step to the timing facts and the
action, without promotional headings, repeated instructions, or scrolling prose.

## Continuous actions

One button starts and stops a continuous action. Its icon, label, and active
state change to show what pressing it will do. Use this consistently for
recording, audio/MIDI playback, clap listening, metronome preview, and any other
continuous action. Running playback/audition, clap listening, and metronome
controls use amber text, border, and tint, including hover and keyboard focus.
Applied options and active categories remain blue; Download stays the primary
blue action. Recording Stop remains red. Show state in text as well as color.
Do not add a separate Stop button beside its start button.

Preserve the conceptual relationships:

- Live signal during setup → original audio in the editor.
- Recording wizard → melody controls in the editor.
- Original audio → resulting MIDI, with symmetrical actions.

## Time and recording length

Live capture follows a scrolling signal. Saved recordings may contain many notes;
do not rely on compressing every note into a fixed-width chart. Leave room for
future zoom and timeline navigation. When those are introduced, audio and MIDI
must share the same visible time range so comparisons remain meaningful.

## Workstation controls and recording state

Put input widgets to the right of their labels, using compact rows that stack
vertically. Keep wizard steps horizontal, with each number above its name and a
small value summary. Use confirmed values where available and name the pending
configuration otherwise. The first step has no Back button.

Remove redundant live-view headings and footer captions. Keep the final Record
step the same height as the other setup steps. When recording starts, animate
the existing setup box narrower and give the signal the recovered width. Keep
step 6 visible, fold away the other steps and setup controls, and preserve the
Record/Stop button's exact position. Keep the workspace height stable. Stop
reverses the animation and restores the wizard. Display the beat/metronome
feedback in relation to the live signal; Stop is the recording action in this
state. Respect reduced motion preferences.

## Implemented studio relationships

Recording retains the approved folding wizard. Editing uses the approved shared
timeline with overlay Tune. Presets occupy one dropdown with separate Preview
and Use actions. Key follows the same dropdown pattern, containing Auto, key
suggestions, all 24 explicit keys, and Preview/Use actions. Controls stay in
compact label–widget–value rows, with explanation text in tooltips. Each control
has a separate Reset button with an accessible name and tooltip; field labels
are noninteractive. Tune's footer offers one-step Undo tuning change beside
the confirmed full Reset. Undo affects melody/playback settings and preserves
manual note edits, muting, recording names, and original audio. Its history
belongs to the open take.
Tune groups Essentials, Pitch, Rhythm, and Detection, with instrument and octave
above the groups. Rename is in the compact header; recording actions and
text/JSON diagnostics live in its menu. Mobile retains external MIDI selection
there as well.

The pan slider sits above the floating zoom buttons so their positions stay
fixed when panning becomes available. Both saved tracks share time zoom, pan,
playhead, and playback following. Pitch
starts fitted to interpreted and muted notes and can be zoomed or fitted again.
Following and pan account for the overlay and pitch-axis inset, including the
last note. Manual pan remains available whenever the overlay hides some of the
time range, even at 1×.

Auditions render exactly the notes sent to playback, name the candidate and
its Applied/Not applied status, and highlight the sounding note. Option rows
label Applied, Previewing, or Base preset explicitly. A preset with custom
overrides is a base recipe rather than Applied. Blue applied rows become amber
while previewing; hover retains the preview cue. The regular MIDI Stop ends auditions and restores
the applied roll. Auditions never save or affect exports. Contextual note controls
and keyboard navigation replace the permanent Notes list. On mobile Tune and its menu close
when auditioning and focus moves to the roll. Reopening Tune restores the last
menu; desktop keeps the controls visible for comparison.

The visual studies are in `prototypes/editor-directions.html`; the shared timeline
with overlay Tune is the implementation reference. The Recording reference remains
`folding-wizard-v8.html` in the ignored `.superpowers/brainstorm/` directory.
