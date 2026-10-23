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

The live signal on the new recording screen becomes the original audio on the
editor screen. Preserve its left-hand position, chart vocabulary, and surrounding
frame to make that continuity apparent. Give the live chart roughly twice the
editor chart's height: its prominence matters more than identical dimensions.

In the editor, original audio belongs on the left and resulting MIDI on the
right. They complement each other. Match their chart dimensions, timeline scale,
and the positions of parallel actions such as play and download. Keep both
canvases in view while the user adjusts the recording.

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
continuous action. Do not add a separate Stop button beside its start button.

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

All three screens share the compact studio shell, Slate & blue system themes,
readable controls, and semantic tokens. The Editor groups paired audio/MIDI
canvases above independently scrolling toolboxes, with aligned playback and
export actions. Presets keep separate preview and apply buttons. Library rows
keep playback and Open visible, with secondary actions in a keyboard-accessible
menu that restores focus when closed.

On narrow screens, both saved canvases stay pinned above stacked toolboxes.
Short windows use compact pinned charts and scrolling settings rather than
clipping the tools. Saved canvases redraw when their containers or system theme
change.

Shared timeline zoom remains future work. Current saved views show the whole
recording and preserve the same time scale across both canvases.

Prototype files remain in the ignored `.superpowers/brainstorm/` directory. The
approved Recording reference is `folding-wizard-v8.html`; prototypes are visual
references, while production retains saving a finished take and opening it in
the Editor.
