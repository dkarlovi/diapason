# Supported inputs and limitations

[Project overview](../README.md)

Read this when a transcription or import does not behave as expected. See the [studio guide](studio-guide.md) for controls and [recording inspection](recording-inspection.md) for diagnosis.

- Slurred repeated notes with neither a level dip nor a pitch change merge.
- Steadiness can absorb quick intentional steps as well as slips. At lower values,
  connecting slides can become intermediate notes; drift within a held note can
  change its representative pitch. These detection limits are being investigated
  in [issue #50](https://github.com/dkarlovi/diapason/issues/50), independently of
  contextual pitch correction.
- Tuning is one offset per take. A performer whose intervals wander by close to
  half a semitone note-to-note (rather than drifting slowly) can still get
  individual notes named a semitone off; repeated figures are not yet compared.
- Strong correction can flatten intended rises; weak correction can keep slips
  and pitch wobble. Presets and individual controls let you compare this tradeoff.
- Automatic key/harmony can be uncertain, especially on short intros. Try the
  previewable alternative keys or preserve odd notes when needed.
- Max pitch move recognises only off-beat passing and neighbour notes as
  deliberate. Accented decoration, such as an appoggiatura that leans on the beat
  and resolves by step, is treated as a clash and moved onto the chord.
- Max pitch move corrects towards chords inferred from the take itself, one per
  bar. A take with many wrong notes can imply the wrong chord, and the fix then
  follows it.
- Pitch detection remains monophonic and band-limited to 250–3000 Hz for whistles.
- Existing recordings can sound different with the new engine. Legacy hysteresis,
  debounce, and median-window settings no longer control note decisions.
- Capturing and correcting notes is local to the browser. Only WAV and MIDI files exported by
  diapason can be imported; plain WAV, MP3 and other files, and user-defined saved
  presets, are not yet available.
- Audio editors often drop unknown chunks when re-saving, so a diapason WAV edited
  elsewhere can no longer be imported.
- Restored takes reproduce the saved melody with matching analysis code. Imports
  from other versions retain saved evidence and report differing current analysis.

Feature ideas and planned work are tracked in
[GitHub issues](https://github.com/dkarlovi/diapason/issues).
