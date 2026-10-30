# Portable tune format v1

A tune is fixed source segments plus the sender's current melody recipe, pitch
edits, mutes, instrument, octave, tempo, meter, duration and name. There is no
sound recording, acoustic frame stream, undo history, saved version, device ID or
sender-local recording ID.

## Envelope and URL

Bytes 0–3 are ASCII `DPSN`; byte 4 is schema version 1; byte 5 is interpretation
version 1 or 2; byte 6 is 0 for raw fields or 1 for gzip. Remaining bytes contain the
fields below, with no trailing data. Choose gzip only when it is smaller than the
raw representation. URLs use unpadded canonical base64url after
`/diapason/#tune=`. The Library offers import before any candidate writes.

Unknown schema/interpretation versions and unsupported flags are rejected.
Format v1's preset defaults, knob order, knob ranges and steps, instrument codes,
and musical interpretation form a compatibility contract. Changes to those
semantics require a new interpretation version; a build must reject a version it
cannot faithfully interpret. Do not silently reinterpret older files with changed
defaults.

Interpretation v1 retains the original control encoding and treats absent Context
correction as zero. V2 appends the Context correction control. An active value or
an explicit override (including zero) requires v2, regardless of the base preset.
Presets only supply control values; no interpretation algorithm branches on their
identity. Legacy recipes with no new control override continue to export as v1,
preserving their original envelope and wire codes. Earlier readers reject v2
rather than silently changing the melody.

## Field order

Unsigned integers are canonical arithmetic base-128 varints (low seven bits first,
continuation in the high bit). Numeric escape values are little-endian Float64.
UTF-8 strings have a byte-length varint and are decoded strictly.

1. Name string; duration in integer milliseconds; Float64 BPM; beats per bar.
2. Preset code: As played, Gentle, Clean, Keep odd, Happy, Sad, Dreamy,
   Syncopated (0–7); Auto tune is appended as code 8.
3. Key byte: 0 is automatic, 1–12 major tonic C–B, 13–24 minor tonic C–B.
4. Sound byte: instrument code in the upper five bits, octave code in the lower
   three. Instruments 0–6 are beep, electric piano, pluck, flute, trumpet,
   saxophone, pad. Octave code is octave + 3; codes 0–4 mean −3 through +1.
   Instrument and octave are always represented, including defaults.
5. Two Float64 values: minimum and maximum interpretation pitch range.
6. Override membership bitmask, then each present override in the frozen order:
   steadiness, minimum length, silence gap, level gate, key pull, leap penalty,
   maximum move, grid pull, swing, syncopation, articulation, grid, mode.
   Select values use option-index varints. Numeric values have a byte indicating
   either a step-count varint (0) or an exact Float64 escape (1).
   Interpretation v2 appends Context correction as bit 13, a 0–1 range in 0.01
   steps (with the same Float64 escape). V1 rejects this bit. A preset's default
   Context correction value and any explicit override are resolved like other
   controls, not as a separate engine mode.
7. Note count, then each note in chronological order:
   - Flags: fractional pitch (bit 0), muted (bit 1), manual pitch override (bit 2),
     exact interpretation timing refinement (bit 3). Other bits are invalid.
   - Start delta from the preceding integer millisecond start, then duration in
     milliseconds, both varints. The first preceding start is zero.
   - If bit 3: exact start, duration and source end as three Float64 values.
   - Baseline pitch: a byte for integer semitones, Float64 for fractional pitch.
   - If bit 2: manually selected MIDI pitch as a byte.

The source interval normally equals performed start/end. Fixed-note edits refer
to note indices on the wire, then become fresh local range-based edits on import.
Muted notes remain in the baseline. On fixed sources, mute membership follows
source time rather than an automatically changing pitch.

The sender first tries rounded millisecond source boundaries. If that changes a
current automatic pitch, selected key, or resulting timing by more than 1 ms, it
retains exact interpretation timing. Refinements preserve source endpoints
explicitly so floating-point addition cannot create overlaps at adjacent notes.
Unrefined durations are reconstructed as integer-derived end minus start, matching
the sender's canonical arithmetic exactly. Even sub-nanosecond differences can
change a tuning tie, so refinement decisions use exact equality and the encoder
checks musical parity against the actual packed/unpacked representation.
Ordinary integer timing has no refinements. Pitch evidence remains exact; no
unverified pitch quantization is used. Total duration rounds up to a millisecond
so it cannot truncate a retained source range. Re-sharing must not accumulate
rounding drift.

## MIDI wrapper

The exported Standard MIDI File remains Type 0, with ordinary audible notes,
General MIDI program, tempo and meter. Octave transposition appears in the
rendered track; out-of-MIDI-range notes follow the external-output behavior and
are omitted. Diapason's original baseline pitches and separate playback choices
remain in metadata and are restored exactly once.

A text meta-event contains ASCII `diapason:tune:1:` followed by base64url of the
same binary envelope. This needs no private manufacturer identifier. Import
requires one recognized payload and checks the standard rendered track against
the payload at the writer's tick resolution. Externally changed or stripped
metadata is unsupported. This is not a generic MIDI importer.

## Limits

The current link offer limit is 16,384 full-URL characters; larger tunes can use
Diapason MIDI. This is an application limit, not a guarantee that every messenger
will preserve a link. Decoder limits are 1 MiB encoded payload, 4 MiB decompressed
fields, 20,000 notes, one hour duration, and 1,024 UTF-8 name bytes. Decompression
is incrementally bounded. Source endpoints must stay within the declared duration;
the decoder also verifies the reconstructed recording can be processed before
offering it for import. MIDI input is capped at 2 MiB including its wrapper.

## Reproducible size measurements

Run `node tools/measure-tune-payload.mjs`. Initial measurements (default musical
settings; no acoustic frames or audio) were:

| Source                    | Notes | Semantic JSON bytes | Packed bytes | Envelope bytes | Full URL characters |
| ------------------------- | ----: | ------------------: | -----------: | -------------: | ------------------: |
| whistle-intro             |    14 |               2,149 |          222 |            229 |                 348 |
| whistle-regression        |    25 |               3,385 |          366 |            373 |                 540 |
| whistle-take2             |    24 |               3,258 |          349 |            356 |                 517 |
| generated repeated phrase |    16 |               1,974 |          134 |             95 |                 169 |
| generated repeated phrase | 1,000 |              92,444 |        6,040 |            134 |                 221 |

Generated phrases are deliberately repetitive and illustrate compression, not
realistic worst cases. Settings, edits, timing refinements and less repetitive
material can increase size. Use the script's current output when evaluating a
format change; these examples are not size guarantees.
