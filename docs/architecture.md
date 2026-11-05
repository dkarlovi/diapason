# Architecture and processing

[Project overview](../README.md)

diapason is a client-side React, TypeScript, and Vite application. See [AGENTS.md](../AGENTS.md) for enforced repository rules and [Development](development.md) for the toolchain.

## Processing map

| Stage                           | File                                                               | Notes                                                                                   |
| ------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Mic capture (raw, DSP off)      | `src/Audio/Audio.ts`                                               | `getUserMedia` + `AnalyserNode`                                                         |
| Pitch detection                 | `src/Audio/Pitch.ts`                                               | McLeod / NSDF, band-limited to whistle range                                            |
| Melody interpretation           | `src/Melody/`                                                      | Viterbi note decisions, key/harmony priors, rhythm and presets                          |
| PCM recorder + offline analysis | `src/Audio/Recorder.ts`                                            | AudioWorklet capture, re-analyze buffers, quality stats                                 |
| Pitch-trace visualization       | `src/Audio/Trace.ts`                                               | Canvas 2D pitch-over-time renderer                                                      |
| WAV encoder                     | `src/Encoding/Wav.ts`                                              | Mono 16-bit PCM WAV for offline inspection                                              |
| Processing evidence             | `src/Diagnostics/Diagnostics.ts`                                   | Structured processing evidence for WAV packages and CLI replay                          |
| MIDI file writer                | `src/Midi/Midi.ts`                                                 | Standard MIDI File (Type 0), no deps                                                    |
| Metronome                       | `src/Audio/Metronome.ts`                                           | Count-in + audible click, AudioContext-scheduled                                        |
| Tempo quantization              | `src/Melody/Quantize.ts`                                           | Snap note start/length to a beat grid                                                   |
| Audio and note playback         | `src/Playback/Playback.ts`, `src/Playback/Instruments.ts`          | Raw audio, or synth notes scheduled 2s ahead of the audio clock                         |
| Web MIDI output                 | `src/Midi/MidiOutput.ts`, `src/Midi/MidiPlayback.ts`               | Device selection and scheduled external note playback                                   |
| Tempo estimation                | `src/Features/Capture/Tempo.model.ts`, `src/Audio/ClapDetector.ts` | Estimate BPM from taps or microphone claps                                              |
| Sound source profiles           | `src/Recording/RecordingProfiles.ts`                               | Whistle analysis settings and calibration checks                                        |
| Storage codec                   | `src/Audio/Codec.ts`                                               | Float32↔Int16, gzip via `CompressionStream`                                             |
| IndexedDB library               | `src/Recording/Recording.storage.ts`                               | Persisted recordings (no deps)                                                          |
| Per-recording melody settings   | `src/Melody/Settings.ts`                                           | Preset, overrides, key choice and legacy migration                                      |
| Path router                     | `src/App/AppRouter.tsx`, `src/Routing/Routes.ts`                   | React Router and route helpers                                                          |
| Screens and hooks               | `src/Features/<Screen>/`, `src/App/`, `src/Studio/`                | React rendering and browser effects, per screen; app shell; behaviour shared by screens |
| Screen models                   | `src/Recording/Capture.model.ts`, `src/Editing/Editor.model.ts`    | Pure calculations shared by hooks and tests                                             |
| Editor playhead                 | `src/Playback/Playhead.store.ts`                                   | Zustand store; playback ticks redraw canvases outside React                             |
| Shared UI + entry               | `src/UI/Button.tsx`, `src/UI/Primitives.tsx`, `src/main.tsx`       | controls and app root                                                                   |

## Capture and cached analysis

The recorder captures contiguous raw PCM via an AudioWorklet. Audio is stored as
gzipped Int16 PCM using browser-native `CompressionStream`; WAV downloads preserve
the PCM samples.

Acoustic analysis starts when a take is opened or its MIDI preview is requested.
A Web Worker computes frames and caches them separately in IndexedDB. Changes to
detector code or effective analysis settings invalidate that cache. Concurrent
requests for the same take share the job across navigation. Environments without
Workers fall back to synchronous analysis.

Melody interpretation uses those frames with the effective musical controls.
Before grid snapping, it estimates and removes a constant onset lag. Grid pull
blends performed and snapped timing while preserving note order; swing and
syncopation retain grid timing for a pair whose displaced notes would collide.
Recording also compensates for browser-reported input and output latency.

## Source boundaries

The source tree uses a layout where folders name the domain, PascalCase
filenames name the thing, and lowercase dotted suffixes (`.model`, `.type`,
`.storage`, …) name the role. `.ls-lint.yml` describes that layout and
`.dependency-cruiser.mjs` its layering: React stays in `src/App`, `src/Features`,
`src/Studio` and `src/UI`, each importing only the layers after it; features never
import each other; `src/UI` is a generic design system that knows nothing about diapason; other `src/` folders stay framework-free; `tools/` only renders data
from `src/Inspection`; import cycles are forbidden unless every module in them is a
`*.type.ts` file (mutually recursive data shapes such as a recording and its edit
history). The tree has no known violations, so any new one fails `npm run check`. `tools/` is
TypeScript that Node runs directly through its built-in type stripping, and `tsc` checks
it with the rest of the project. dependency-cruiser parses with swc
because it cannot load TypeScript 7 yet; swc still marks `import type` edges, which the
cycle and `*.type.ts` rules rely on.

## Melody interpretation

The decoder finds notes before naming them. A dip in level (re-articulation) or a
real silence always starts a new note; within one articulation, a sustained pitch
step does too, while scoops, vibrato and drift stay part of the held note; higher
**Steadiness** absorbs longer slips (up to 250 ms). Each note then gets one steady-state pitch. The performer's
tuning offset from A440 is estimated from the whole take (whistlers are often a
quarter-tone off), and the tuned pitch, key, implied harmony and step size decide
each note name. Captured and exported WAV audio is never pitch-corrected. Musical
context is a prior, not knowledge of the intended tune: a note whose pitch sits
halfway between two in-key notes can still be named wrongly.

The intro sample in `tests/fixtures/whistle-intro/` is an exact regression: the
retired Clean preset must export its approved `clean.mid` byte for byte, and Auto
tune produces the same notes.
