# Phase 1 — Takes library restructure

> **Status: BUILT (2026-10-21).** Pending in-browser verification (IndexedDB, metronome
> timing, mic capture). Headless checks pass: build/typecheck, codec round-trip, quantize,
> mask chain, module serving.

Reframes diapason from a one-page tool into a **recording studio**: your takes
are the artifact. Library of recordings (persisted) → capture with a visual
metronome → editor for all post-processing (detection, tuning, quantized MIDI).

## Decisions (locked)

- **Full calibration on every `Add new`** (device → gain → room noise → signal check → record).
- **Per-recording tuning**, persisted; new takes inherit last-used values as their start.
- **Storage:** gzipped Int16 PCM via native `CompressionStream` (lossless, no deps). Downloads stay WAV.
- **Tempo baked in at record time** via a plain **audible metronome** + count-in. The click
  bleeds into the raw mic, but since we schedule it we **mask the known click windows at
  detection time** (skip ~40 ms around each beat) — not adaptive echo cancellation. Stored
  audio stays lossless. Quantization (extra D) is in from the start.
- **Keep it simple: no special casing.** No visual metronome, no headphone toggle, no
  pickup/anacrusis handling — count-in, then record starting on the downbeat.

## Views + routing (hash router)

- `#/` **Library** — list of takes (name, date, duration, BPM, note count), `+ Add new`, per-take open/rename/duplicate/delete/export.
- `#/new` **Capture** — tempo + metronome + full calibration + record → saves take → opens editor.
- `#/take/:id` **Editor** — pitch trace, per-take tuning sliders, note list, tempo/quantization, exports.

## Data model (IndexedDB, versioned)

```ts
Recording {
  id: string; name: string; createdAt: number;
  sampleRate: number; durationSec: number;
  bpm: number; beatsPerBar: number;      // baked tempo; audio t=0 == downbeat (beat 0)
  audio: Blob;                           // gzipped Int16 PCM (CompressionStream)
  capture: { gain: number; peak: number; noiseFloor: number; dspOff: boolean };
  tuning: SegmentOptions;                // per-recording
}
```

- `db.ts`: minimal no-dep IndexedDB wrapper (open/get/getAll/put/delete) + schema version.
- `codec.ts`: Float32 ↔ Int16, gzip ↔ gunzip via `CompressionStream`/`DecompressionStream`.
- Re-run pitch detection on open (deterministic; cache frames in memory per session).

## Capture flow

Full calibration (reuse current gating: device, gain, raw/DSP badges, live meter,
**Record the room**, signal checklist). Plus:

- **BPM + beats/bar** inputs (defaults 90, 4/4).
- **Audible metronome** scheduled on the `AudioContext` clock (same clock that timestamps
  pitch frames, so grid ⟷ notes align). A short tick per beat, accent on the downbeat.
- **1-bar count-in**, then PCM capture starts **on the downbeat** (audio t=0 = beat 0), so
  beat k is at `k·60/bpm`.
- **Click masking at detection:** frames whose analysis window falls within ~40 ms of any
  beat time are marked unvoiced. Deterministic, no DSP; stored audio untouched/lossless.
- On stop: encode → gzip → save Recording → navigate to its editor.

## Editor

- Full pitch trace (`trace.ts`).
- Per-take **tuning sliders** (bound to the take, saved on change).
- **Tempo + quantization (extra D):** snap note start/length to `k × 60/bpm ÷ subdivision`;
  controls for subdivision (1/4,1/8,1/16,triplets) and a raw↔quantized toggle. Export uses the take's bpm.
- Live **note list**; exports: MIDI / WAV / JSON / copy-log; rename / duplicate / delete.

## Code structure

Split `main.ts` into `router.ts`, `views/library.ts`, `views/capture.ts`, `views/editor.ts`,
plus `db.ts`, `codec.ts`, `metronome.ts`, `quantize.ts`. Reuse untouched:
`audio.ts, recorder.ts, pitch.ts, notes.ts, trace.ts, midi.ts, wav.ts, diagnostics.ts`.

## Deferred (later phases)

- **A** note blocks overlaid on the trace
- **B** playback (raw audio + detected-notes synth preview)
- **C** trim in/out points
- FLAC export (WASM), presets, storage-usage UI

## Risks / calls

- IndexedDB quota: fine for dozens of short takes; surface usage, guard writes.
- Click masking assumes the click is near-instant at the scheduled beat; a ~40 ms guard each
  side absorbs speaker→mic latency. If clicks still leak into detection, widen the guard.
- `AudioContext` must be created on a user gesture (capture start) — already the case.
