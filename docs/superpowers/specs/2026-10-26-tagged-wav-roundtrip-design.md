# Tagged WAV round trip

The capture-only behavior described here is superseded for future implementation by
[Single-file recording and melody package](2026-10-29-recording-package-design.md).
This document remains the historical description of schema-1 WAVs.

Issues: #8 (embed metadata in exported WAV), with the tagged-file half of #9 (import).

## Intent

Make the recorded WAV a complete, portable recording. I record a take, press
**Download WAV** in the editor, and send the file to a friend. They drop it onto
their own diapason (another browser, another machine, Chrome → Firefox) and get the
same recording I had **the moment I stopped recording**: same audio, tempo, meter,
downbeat, level gate, sound profile and capture info. With no edits, their editor
shows the same notes and exports byte-identical MIDI to mine with no edits.

Editor state is deliberately not carried. The receiver gets a fresh, unedited take.

## Goals

- **Download WAV** (editor, `useEditorExports.downloadWav`) writes a tagged WAV:
  - unchanged `fmt ` and `data` chunks (mono PCM16, same samples as today);
  - a custom `diapason` chunk holding versioned JSON (below);
  - a standard `LIST`/`INFO` chunk: `INAM` (name), `ICRD` (creation date, ISO 8601),
    `ISFT` (`diapason <version> (<revision>)`), `ICMT` (short human summary, e.g.
    `94 BPM, 4/4, whistle`);
  - a standard `acid` chunk with tempo, beat count and meter, so DAWs that honour it
    place the file at the right tempo.
- The Library can import a tagged WAV, by dropping a file on the Library or via an
  **Import WAV** button next to **New recording**.
- Round trip is verified by a fixture test (see Done when).

## Non-goals

- Carrying editor state: melody preset, key, overrides, note edits, muted notes,
  quantize, playback settings. Imports start from defaults, like a new take.
- Importing untagged WAVs, other formats (MP3, stereo, other bit depths), detecting
  tempo or downbeat, or a provenance preview screen. Those stay in #9.
- Changing committed fixture WAVs or their hashes. The editor's diagnostics JSON
  hashes the same tagged bytes as Download WAV, so replay still matches the file the
  user downloaded; other diagnostics callers stay plain.

## Anti-goals

- An imported file overwriting or silently duplicating a recording that is already in
  the library (that would destroy the owner's edits).
- A tagged WAV that no longer plays or opens in ordinary audio tools.
- Any change to the audio samples or to MIDI output for existing recordings.

## Embedded metadata (`diapason` chunk)

UTF-8 JSON in a chunk with the four-character id `dpsn` (my call; any fixed,
unregistered lowercase id works). Padded to even length per RIFF rules. Shape
(schema version 1):

```json
{
  "app": "diapason",
  "schemaVersion": 1,
  "kind": "recording",
  "recording": {
    "id": "mvl403tu-z13urb",
    "name": "Recording Oct 23, 05:12 PM",
    "createdAt": 1792768375650,
    "bpm": 94,
    "beatsPerBar": 4,
    "downbeatSample": 0,
    "source": { "profileId": "whistle", "analysis": { "windowSize": 2048, "...": "..." } },
    "capture": { "gain": 1, "peak": 0.133, "noiseFloor": 0.00097, "rmsGate": 0.003, "dspOff": true }
  },
  "provenance": {
    "build": { "version": "...", "revision": "...", "source": "...", "pipeline": 4 },
    "browser": "<navigator.userAgent>",
    "audioOutput": "unknown",
    "midiOutput": "Browser synth"
  }
}
```

- `sampleRate` and `durationSec` are not stored; they come from `fmt `/`data`.
- `downbeatSample` is explicit even though it is always 0 for our recordings. The
  importer rejects (or trims to) non-zero values. Builder's call: trim the audio so the
  downbeat is t=0, since `Recording.audio` assumes t=0 is the downbeat.
- Exported values are the **recording-time** values, never the editor's current ones.
  The level gate is `capture.rmsGate` (what `useCapture` measured), not the melody's
  Level gate knob, even if the user has since changed it. Legacy fallbacks, in order:
  `capture.rmsGate` → `tuning.rmsGate` → the preset default; the resolved value is
  written into `capture.rmsGate`. `source` falls back to the whistle profile.
  Consequence (for the README): the receiver sees the take as it was before any edits,
  which may differ from what the sender's editor currently shows.
- Provenance mirrors the diagnostics `context` (`useEditorExports.reportInput`).
- **Provenance is kept on import** (my call): a new optional `Recording.origin` holds
  the embedded `provenance` block. On export, a recording with `origin` writes it
  unchanged, so the original build and browser survive any number of hops; one without
  writes the current context. #9's provenance preview reads the same block.

## Import behaviour

Revised during implementation at the user's request: dropping or picking files does
not import them straight away. The Library shows a drop area while files hover, then
a popover (no new screen) listing each file with name, recording time, tempo, meter
and diapason version; untagged or damaged files show their reason, files already in
the library show "Already in your library" with an Open link. **Import** saves the
new ones; **Cancel** saves nothing. The original steps below describe what Import does.

1. Parse the file (`decodeWav` + metadata reader). If it is not a valid WAV or has no
   `diapason` chunk, show: "Only WAVs exported from diapason can be imported for now."
   Unknown future `schemaVersion` → similar clear message.
   Validation (my call): reject with a clear message when the profile id is unknown to
   this build or the analysis settings fail `analysisOptionsFor`'s checks, rather than
   silently falling back to defaults and producing different notes. `rmsGate` is
   clamped by `newRecordingMelody` exactly as at record time, so no extra rule.
   A different `provenance.build.pipeline` than this build's `PIPELINE_VERSION` does
   not block or warn: the import goes ahead (decided). The README notes that identical
   notes are only guaranteed between matching analysis versions.
2. If a recording with the embedded `id` already exists, do not write anything. Show a
   notice ("Already in your library") and open the existing recording.
3. Otherwise build a `Recording` exactly as `useCapture` does after a take: original
   `id`, `name`, `createdAt`, `bpm`, `beatsPerBar`, `source`, `capture`; `sampleRate`
   and `durationSec` from the audio; `audio` via `encodeAudio`; `waveform` via
   `summarizeWaveform`; `melody: newRecordingMelody(capture.rmsGate)`, `origin` from the payload. Save with
   `putRecording`, reload the library, and show a success notice.
4. Multiple files dropped at once: import each in turn (builder's call; one is fine
   to start, but must not crash on several).

## Kind

`kind: "recording"` marks a payload that rebuilds a take. Import requires it and
refuses any other kind ("This diapason WAV is not a recording, so it can't be
imported."), so a future tagged render of the MIDI can never be imported as a
recording by this build.

## Import record

Revised at the user's request: every imported recording stores
`imported: { at, fileName, metadata }` — the time it was saved into the library, the
file's name, and the `dpsn` payload exactly as parsed (unknown fields kept). This
replaces the earlier `origin` field; re-export reads `imported.metadata.provenance`.

## Structure

Follow the repo conventions (pure modules, effects in hooks):

- `src/wav.ts`: extend the writer to accept optional extra chunks; `encodeWav` without
  metadata stays byte-identical to today.
- A new pure module (e.g. `src/wav-metadata.ts`): build the payload from a `Recording`
  plus context, encode the `dpsn`/`LIST`/`acid` chunks, and parse a tagged WAV back
  into a `Recording`-ready shape with validation.
- `src/wav-reader.ts`: expose unknown chunks (or a chunk iterator) so the metadata
  reader does not re-walk RIFF itself.
- `useLibrary`: `importFile(file)`; `Library.tsx`: button, drop target, notices.

## Constraints

- RIFF size header must be correct; odd-length chunks padded with one zero byte.
- PCM float ↔ PCM16 must round-trip exactly (`pcm.ts` already guarantees this).
- Keep Fallow duplication/health baselines from growing.
- `README.md` updated: what the downloaded WAV contains, how to import, the
  tagged-only limitation, and that audio editors may strip the tags on re-save.

## Done when

- Fixture test: `whistle-intro` original WAV + its recording-time metadata → tagged
  WAV → parsed and imported `Recording` → Clean transcription exports MIDI
  byte-identical to `src/fixtures/whistle-intro/clean.mid`.
- Unit tests: chunk layout and RIFF sizes, odd-length padding, plain `encodeWav`
  unchanged, `acid`/`INFO` fields, rejection of untagged and malformed files,
  duplicate-id import opens the existing recording without writing.
- Library tests: import button and drop both import a tagged file; untagged file shows
  the message.
- A tagged file plays and is read by `ffprobe` (checked locally) without errors.
- Existing diagnostics and fixture tests pass unchanged; `npm run check` passes.

## Left to the builder

Exact chunk id, JSON validation approach, notice wording and styling, drop-zone visual
feedback, and how `ICMT` is phrased.
