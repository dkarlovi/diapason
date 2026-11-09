# Share, export, and restore

[Project overview](../README.md)

Choose a format for the work you want to share:

| Format        | Includes                                                        | Best for                                      |
| ------------- | --------------------------------------------------------------- | --------------------------------------------- |
| Tune link     | Editable melody and current musical settings, without audio     | Opening a tune immediately in another browser |
| Diapason MIDI | Playable MIDI plus the editable tune metadata                   | DAWs, larger tunes, and portable tune import  |
| Diapason WAV  | Original audio, current tune and edits, and processing evidence | Restoring or investigating a recording        |

Undo history and named versions stay local; they are not part of these exports.

## Share an edited tune

In the Library recording actions or the editor's main recording dropdown,
**Copy tune link** packs the current melody into an ordinary URL. The editor
finishes the current gesture before copying; temporary tunes stay unsaved. **Download MIDI** in the Library or editor produces a playable
Diapason MIDI file containing the same editable tune. Both carry your current
preset/key, control choices, pitch corrections, automatic contours, manual bend
edits, mutes, instrument and octave.
Corrections remain marked as edits; resetting one returns to the automatic pitch
under the current musical settings. Reset bend restores the automatic contour;
whole-note pitch edits transpose it. Muted notes can be unmuted.

## Open and save a tune link

Opening a tune link immediately opens a playable, editable tune without importing
anything into the Library. Edits, undo/redo history, names and versions live in
sessionStorage for that tab and survive refresh. The URL remains the original baseline.
**Save** in the actions dropdown creates a recording with your work and history,
then redirects to its editor. You are now editing that recording. Leaving an edited
temporary tune in the full app warns about unsaved changes; confirming discard
removes the draft. Refresh and closing the page use the browser's native warning.
Opening the link without a matching session draft starts from the original tune.
If storage is blocked, editing works in memory and a warning explains that refresh
may lose the work. Browser-duplicated tabs may initially copy a session draft.
Every open instance of the same tune link, in any tab or embed, shows the draft the
last of them committed; one in the middle of a gesture keeps it and announces the
result when it finishes. Embeds of different tunes stay independent.

## Import a Diapason MIDI file

Picking or dropping a Diapason MIDI file still offers **Import** or **Cancel** in
the Library. Inspection saves nothing; **Import** creates a new local copy, which
you can play or **Open**.
No original audio, acoustic analysis, undo history or saved versions are sent.
Your friend starts a fresh editing session and can share their changes again.
The Library distinguishes these tunes with a musical-file icon and a subtle
background tint, keeping the same row layout as audio recordings.

Imported tunes have fixed detected note boundaries. Key/mode, musical pitch
shaping, rhythm/grid/swing, note length, pitch edits, muting, instrument and octave
remain adjustable. Steadiness, minimum detected note length, silence gap and level
gate remain visible but disabled, with hover tooltips explaining that their
analysis data is not included. The explanations do not add rows to the controls. Presets apply only supported musical settings. Original-audio playback,
WAV download, acoustic diagnostics and trace overlay are unavailable for these
tunes. The editor opens with the original track closed; **Show original** stays
disabled with a tooltip explaining that the audio was not included.

## Link and MIDI compatibility

Links contain a compact binary payload in the URL fragment; sharing needs no
upload or account. Timing normally uses milliseconds, with precision retained
where needed to preserve musical decisions. The current link limit is 16,384
characters; use Diapason MIDI for larger tunes or if a messaging app truncates a
link. Clipboard failure exposes a selectable link. Only intact MIDI files exported
by Diapason can be imported; ordinary MIDI import is unsupported. Other programs
can play the rendered MIDI, though their instrument sounds vary, and may remove
or invalidate Diapason metadata if they edit/re-save the file. The recipient's
MIDI device routing and viewport are local choices.

Smooth Glide output includes standard MIDI 1.0 pitch-bend messages, bend-range
configuration, and resets. Coarse and Fine steps use ordinary notes. Devices that
ignore the range configuration may need their bend range set manually. Saved
automatic and manual curves remain separate in editable metadata, so their
controls and resets survive a round trip. Older tunes without curves retain their
saved interpretation and flat MIDI output.

See [the portable format](portable-tune-format.md) for packing, compatibility
rules, decoder limits and reproducible size measurements.

## Recording packages (WAV)

The editor's **Download WAV** is a portable recording package: the original mono
PCM16 audio plus versioned JSON in the `dpsn` chunk containing capture settings,
full current edit intent (including hidden edits), current melody, playback
settings, exact exported MIDI bytes, and original pitch/processing evidence. Standard `LIST/INFO` and `acid`
chunks retain title, date, tempo, and meter for audio tools that support them.
MIDI remains the musical deliverable; the WAV keeps everything needed to revisit
its source and investigate detection.

Import the WAV in the Library and choose **Restore saved tune and edits** (default)
or **Start fresh from audio**. No separate tune or MIDI import is needed. Fresh
imports use capture defaults while keeping the received package as a reference.
For an existing recording, open the local copy or explicitly **Import as copy**;
imports never overwrite local work. With matching processing code, restoring the
tune reproduces the edited melody and MIDI. If current analysis differs, a warning
icon beside the original recording's Play explains it on hover; the imported file keeps
the original evidence for CLI inspection, and new downloads carry the current result.

Capture provenance survives subsequent exports; current tune, evidence, and export
provenance are refreshed. PCM samples remain unchanged, but the complete file may
change after editing or re-exporting. Schema-1 WAVs still import as fresh takes.
History, named versions, theme, viewport, selection, temporary auditions, and MIDI
device routing are not exported. Apply or stop an unapplied audition before
exporting. Audio tools may strip Diapason chunks when re-saving the file.
