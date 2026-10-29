---
name: diapason
description: A restrained seed-themeable studio where the canvas is the work.
colors:
  primary: "light-dark(#2f628c, #9bcbfb)"
  primary-foreground: "light-dark(#ffffff, #003353)"
  warning: "light-dark(#6c4d0f, #ebc078)"
  destructive: "light-dark(#ba1a1a, #ffb4ab)"
  success: "light-dark(#365b32, #a7d29e)"
  background: "light-dark(#f8f9ff, #111418)"
  foreground: "light-dark(#191c20, #e1e2e8)"
  card: "light-dark(#fdfcff, #191c20)"
  muted: "light-dark(#eff0f7, #0b0e13)"
  border: "light-dark(#c3c6cf, #43474e)"
  muted-foreground: "light-dark(#43474e, #c3c6cf)"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 550
    letterSpacing: "-0.03em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "1rem"
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  secondary:
    fontFamily: "system-ui, sans-serif"
    fontSize: "0.8125rem"
  measurement:
    fontFamily: "ui-monospace, monospace"
    fontSize: "0.6875rem"
rounded:
  control: "5px"
  floating: "6px"
  library: "7px"
spacing:
  field-gap: "8px"
  field-bottom: "12px"
  header-block: "10px"
  header-inline: "32px"
components:
  button-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  button-danger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.destructive}"
    rounded: "{rounded.control}"
    padding: "7px 12px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: "38px"
  pitch-canvas:
    backgroundColor: "{colors.muted}"
    rounded: "0px"
    width: "100%"
    height: "100%"
  workstation-nav:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
  active-category:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
  recording-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    padding: "20px"
---

## Overview

**Creative North Star: "The canvas is the work"**

Blue & slate by default, professional and restrained. Custom seed themes preserve the same semantic roles and hierarchy. Recording and editing are compact
workstations: the signal or melody owns the space, and controls support it.
Preserve this established direction when refining or extending the interface.

**Key Characteristics:**

- Edge-to-edge work surfaces beneath one compact header.
- Shared controls and semantic color roles across Library, Recording, and Editor.
- Generated light/dark themes with explicit URL overrides, precise status, and playback feedback.

This record describes the implemented system in `src/theme.css`, `src/capture.css`,
`src/studio.css`, and `src/editor.css`, together with the existing agreements in
`docs/design-principles.md`. `src/theme-palette.ts` owns generated runtime colors;
CSS owns mappings, loading fallbacks, layout, and state styles. Update this record
and its `.impeccable/design.json` companion when changing the shared system.
The legacy aliases in `src/styles.css` now reference the shared semantic tokens;
they are not a second identity for new studio work.

## Colors

The default palette combines quiet slate surfaces with a blue action and pitch accent.
Frontmatter records generated default values. `src/theme-palette.ts` owns runtime
generation with Material Color Utilities Tonal Spot; custom primary/neutral/secondary
seeds remap these roles. The root follows the system through `color-scheme: light dark`
unless `scheme=light|dark` forces a mode. Portals and canvas probes inherit it.

- **Studio Blue** (`primary`): primary actions, applied selections, active categories, live pitch, and
  interpreted MIDI notes. The primary foreground maintains their text contrast.
- **Amber** (`warning`): setup summaries, running playback/audition controls (including Stop), and the original
  recording trace, distinguishing the performance from the interpreted notes.
- **Signal Red** (`destructive`): clipping, errors, destructive actions, and Stop
  during recording, with context-specific treatments in the recording stylesheet.
- **Confirmation Green** (`success`): completed setup, saved takes, and the
  recording mark. Green does not replace the blue pitch palette.
- **Slate surfaces** (`background`, `card`, `muted`): application ground,
  controls/panels, and the recessed canvas respectively.
- **Slate structure** (`foreground`, `muted-foreground`, `border`): readable
  primary text, secondary information, and dividers.

**The Semantic Color Rule.** Reuse the existing semantic tokens and `--trace-*`
palette. `--color-playback` is independent of warning (amber by default), and
`--color-playback-muted` is its generated container. Primary applied states use
`--color-primary-muted`; retain generated foreground/container pairings. Include text or state semantics alongside status colors.

## Typography

Use the platform sans-serif stack throughout. Monospace and tabular numerals
serve measurements and timing rather than decorative headings.

- Library title: the title role, reduced on mobile.
- Workstation body: the body role; field labels and controls use the label scale.
- Supporting information: secondary scale, with smaller canvas metadata and
  measurement readouts where already implemented.
- Canvas labels: the renderer uses system sans-serif at 12px for inset studio
  axes. These raster labels are separate from the rem-based DOM text scale.
- Brand: a compact semibold wordmark; no separate display typeface.

**The One Heading Rule.** Show the current screen or recording name once in the
workstation breadcrumb. Do not repeat it as another workspace heading.

## Layout

Recording and editing fill the viewport below a shared header (minimum 64px).
Their work surfaces have no outer cards, width caps, or gutters. Library uses a
centered list with a wider reading area (maximum 1280px).

Recording allocates equal widths to the live signal and setup dock on desktop.
Portrait phones put setup below the canvas. The six setup steps remain visible
until recording folds the dock around the final step, preserving Stop's position.
Short landscape screens retain the split and use compact step presentation.

Editor stacks original audio above MIDI using one time axis. Original audio
occupies 22% when shown and starts hidden on mobile. Tune overlays the right side,
starts at 360px, and resizes from 286px to half the workspace. Paired playback
controls move together to remain available beside it. Zoom and pan float over
the work rather than taking a dedicated row.

**The Canvas Space Rule.** Controls must not push the signal or melody out of the
viewport. Dense toolboxes scroll internally; work surfaces retain their space.

## Elevation & Depth

The studio is mostly flat. Surface tones and thin borders distinguish the
workspace, header, and toolbox. Soft shadows belong to floating controls,
popovers and toasts. Tune uses a flat tonal surface with a distinct header and
category rail. Shadows communicate which controls sit above
the canvas rather than turning every section into a raised card.

Recording's principal motion is the existing folding dock (460ms), with shorter
opacity transitions. Preserve its stable Record/Stop position and reduced-motion
override. Exact shadow and motion values live in the sidecar and source CSS.

## Shapes

Controls have gently rounded corners; floating widgets are slightly rounder.
Library rows form one bordered list. Workstation canvases and the desktop Tune
panel meet their boundaries squarely, with no nested rounded canvas cards.
Dividers, small handles, and consistent Lucide strokes supply structure.

## Components

### Shared controls

Use `src/components/primitives.tsx` for screen buttons and label/control fields;
its Button delegates to the variant-based primitive in `src/components/ui/button.tsx`.
Default, primary, and danger variants preserve focus-visible and disabled states.
In the editor, Download is the primary action and retains its visible label.
Play/Stop is secondary preview; its label is hidden on small screens while its
accessible name and tooltip retain the current action.
Continuous actions use one button whose icon and label change between start and
stop. Running playback, clap listening, and metronome controls share amber text,
border, and tint through hover and keyboard focus. Recording Stop retains red.
Inputs use explicit labels. Tune places a separate, named Reset icon beside each
control with quiet resting chrome; labels are noninteractive. The confirmed full Reset sits in Tune’s heading beside Close; mobile heading actions
retain 44px touch targets. Undo and Redo remain on the MIDI canvas, preserving
space for the scrollable tuning controls.

### Pitch canvas

`src/components/PitchCanvas.tsx` is the common native canvas for live recording,
original audio, and MIDI. It requires an accessible name, supplies fallback text,
and forwards the native ref and attributes without adding layout wrappers.
`src/studio.css` owns its edge-to-edge geometry. `src/theme.css` owns its palette;
`src/trace.ts` remains the common drawing implementation.

The owner retains behavior: `useMicrophone` draws the live scrolling trace;
`useEditorPlot` draws saved audio and MIDI and handles theme/size redraws. The
editor retains keyboard note selection, click-to-preview, mute, touch/mouse pan,
and zoom in its existing components and hooks. Live monitoring remains passive.
Keep input level, pitch, and beat feedback in DOM overlays rather than rasterizing
controls into the canvas.

For reuse, render `<PitchCanvas ref={traceRef} aria-label="Live pitch trace" />`
inside a positioned container. Pass screen classes, event handlers, focusability,
and instruction references as native props. Call the existing renderer from the
owning hook; the primitive does not schedule rendering or own audio data.

### Floating tools and menus

Tune has two explicit groups in DOM and reading order. Playback sound contains
Instrument and Octave. Melody correction contains Preset and Key directly above
the Essentials/Pitch/Rhythm/Detection category rail and its sliders. Presets own
the slider recipe; Key is its musical context. Playback settings remain separate
from exported-note correction. The category selection uses the primary fill and
primary foreground, and measurements use tabular numerals. The toolbox uses a
muted ground, a card header, and clear spacing between its two groups.

Use the shared Radix popover primitives for viewport-aware placement, Escape,
and outside-click dismissal. Melody options distinguish Preview from Use;
preview does not save or change exports. Blue marks an applied option; amber
marks an auditioning option, with Applied, Previewing, or Base preset text.
A preset with custom overrides is identified as the base preset rather than Applied.
Individual setting options compare their effective value, including preset defaults.
The roll names the audible candidate and its applied status. Preview highlights persist on hover. On mobile,
audition closes Tune and its menu and focuses the roll; reopening Tune restores
the last menu. Desktop keeps controls visible for comparison. Zoom, pan, and level widgets use the
same panel, border, and modest shadow vocabulary.

### Note inspector and edited notes

Selecting a roll note opens one inspector, anchored below the note on desktop and
docked at the bottom of the roll on phones (where it replaces Tune and pans the note
into view above it). It mirrors Tune's tonal split: a darker one-line heading band
holds the identity once (`#3 · C5`), start and duration, then fixed-size secondary
icon buttons for Play in context (amber while running) and Mute note (`aria-pressed`,
blue tint). Property rows sit on the neutral surface and share one grid: label,
bordered steppers with the muted fill, a tabular value, and a borderless Reset that
keeps its slot and appears only once that property is edited. Nothing moves when a
note is muted or edited, so later rows (position, duration, velocity) slot in.

Direct manipulation edits only the already-selected note and only along supported
axes: today that is a vertical pitch drag, snapping to semitones, with an
`ns-resize` cursor and a taller grab target (at least 24px) for touch. The roll,
stripes, origin link and inspector value preview the drag live, and each semitone is
auditioned; release saves one edit. Unsupported directions do nothing rather than
moving the note.

Edited notes are striped on the roll in equal-width diagonal bands; muted edited
notes use gray bands inside their dashed outline. Stripes are a pattern rather than
a new hue, so they survive grayscale; outlines stay reserved for selection, and
sounding playback overrides the stripes. A note whose value differs from detection
also shows a dashed outline at its detected position, linked to the edit, faint
except for the selected note. The inspector repeats the stripe as a small swatch on
each edited row.

### Recording rows and status

Library rows retain visible preview/Open actions and an actions menu, with hover
and focus-within feedback. Their subdued waveform decoration represents original
audio. Setup states combine labels, checks, and semantic colors; clipping and
recording failures remain explicit. Library’s mobile heading keeps its title intact;
actions use Import and New at every size, moving together to the next row when needed.

All three screens share `Toast`: centered in the viewport, 94% opaque card surface,
soft downward shadow, semantic status icon, readable foreground copy, and explicit
Dismiss. An optional Open action links to the saved/imported take. Success and
playback dismiss after 6 seconds, actionable notices after 8, errors after 10;
hover and keyboard focus pause the timer. Playback feedback clears when playback
stops. Persistent editor save errors retain their dedicated recovery controls.
Mobile New/Edit navigation requests fullscreen within the link’s user gesture;
a compact header toggle supports direct arrivals and exit where the API is available.

## Do's and Don'ts

### Do

- **Do** preserve the canvas as the primary work surface.
- **Do** reuse semantic theme tokens, shared controls, and the pitch canvas.
- **Do** keep original audio and MIDI aligned in time.
- **Do** retain keyboard focus, accessible names, and reduced-motion behavior.
- **Do** preserve Record/Stop size and position through the folding transition.

### Don't

- **Don't** duplicate the workstation name as a second heading.
- **Don't** introduce a separate visual system for recording and editing.
- **Don't** replace textual state feedback with color alone.
- **Don't** couple live capture's rendering loop to the editor's playback lifecycle.

## Seed themes and verification

Theme seeds are normalized opaque hex values in code and packed RGB bytes in the
URL-safe base64url `theme` parameter, with optional definitions for light/dark. One definition generates both schemes.
Primary owns actions/MIDI; optional neutral owns quiet surfaces/text; optional
secondary owns playback/original audio. Exact seed tones are not promised.
Warning, destructive, and success retain their semantic hue families.

`src/theme-config.ts` validates the public contract; `useStudioTheme` owns root
application and cleanup. `--color-input-border` is the stronger interactive edge;
`--color-border` remains a quiet decorative separator. Chart caches invalidate
on seed/effective-scheme changes. Forced colors use system roles and existing
labels, stripes, and outlines remain meaningful without hue.

Use the Impeccable colorize/extract and Operate guidance before changes, inspect
real screens, then audit and polish. The research-backed rationale and full
workflow live in `docs/superpowers/specs/2026-10-29-seed-themes-design.md`.
