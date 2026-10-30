# Package and replay verification

Load after `inspect` reports a failure, mismatch, skipped check, or questionable
import/export behavior.

```sh
bin/diapason verify '/path/to/recording.wav' --format markdown
bin/diapason verify '/path/to/recording.wav' --json
```

`verify` exposes package/container and PCM integrity, edited replay, exact MIDI
bytes, musical events, restore/fresh imports, PCM round trips and source
non-mutation. Optional installed `ffprobe` supplies interoperability evidence;
its absence alone is not a failure. This does not write browser IndexedDB.

Read `data.checks`: each check has a status, reason and, when applicable, first
field difference and maximum numeric delta. Distinguish:

| Result / exit    | Meaning and response                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| `pass` / 0       | Applicable checks agree; this does not approve the transcription.                  |
| `incomplete` / 0 | Required historical evidence is absent; name the skipped checks.                   |
| `mismatch` / 1   | Valid saved observations differ from current replay; inspect the differing fields. |
| `fail` / 2       | Invalid input or an invariant/operation failure; use the error path and check ID.  |

An exit-1 command still returns useful evidence; read stdout. JSON failures also
return one structured report on stdout. Text usage errors go to stderr.

Numeric comparison uses absolute tolerance `1e-9`, retaining smaller observed
deltas. MIDI bytes compare exactly. Logical source notes and portable playback
are different representations: timing rounding, octave and filtering can matter.
Do not reinterpret every source-to-portable projection difference as corruption.
A different or unknown saved build does not independently establish musical drift.

Schema-1 capture-only WAVs lack a saved melody baseline. Do not fabricate one or
claim full verification. Arbitrary audio WAVs may lack diapason package metadata.
Explain that limitation using the reader's diagnostic.

Only when a necessary field is absent from focused reports, retrieve the original
metadata with `inspect '<wav>' --raw --json`; ordinary `inspect --json` is a compact
report. Avoid dumping the whole package into the conversation.
