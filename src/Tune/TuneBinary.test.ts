// @vitest-environment node
import { expect, it } from "vitest";
import { TuneReader, TuneWriter } from "./TuneBinary";
import { packTune, unpackTune } from "./TuneFields";
import { createPortableTune, validatePortableTune, TUNE_LIMITS } from "./PortableTune";
import { noteRecording } from "../../tests/support/note-recording";
it("uses unsigned varints without 32-bit truncation and rejects overflow", () => {
  const writer = new TuneWriter();
  writer.uint(4_294_967_296);
  expect(Array.from(writer.finish())).toEqual([128, 128, 128, 128, 16]);
  expect(new TuneReader(writer.finish()).uint()).toBe(4_294_967_296);
  expect(() => new TuneReader(Uint8Array.from([128, 0])).uint()).toThrow();
  expect(() => new TuneReader(new Uint8Array(9).fill(255)).uint()).toThrow();
});
it("has an independently checked binary header and rejects invalid note references", () => {
  const tune = createPortableTune(noteRecording(), []);
  const raw = packTune(tune);
  expect(Array.from(raw.slice(0, 10))).toEqual([6, 83, 104, 97, 114, 101, 100, 208, 15, 0]);
  expect(unpackTune(raw).noteSource.segments.map((s) => s.pitch)).toEqual([72, 74]);
  expect(() => validatePortableTune({ ...tune, mutedIndices: [2] })).toThrow();
  expect(() =>
    validatePortableTune({ ...tune, pitchEdits: [{ noteIndex: 0, midi: 128 }] }),
  ).toThrow();
  expect(() =>
    validatePortableTune({ ...tune, name: "a".repeat(TUNE_LIMITS.nameBytes + 1) }),
  ).toThrow();
  expect(() => unpackTune(Uint8Array.from([...raw, 0]))).toThrow();
});
it.each([
  { version: 1 as const, overrides: {}, controls: [0] },
  {
    version: 2 as const,
    overrides: { contextCorrection: 0.37 },
    controls: [128, 64, 0, 37],
  },
])("preserves frozen interpretation $version bytes", ({ version, overrides, controls }) => {
  const record = noteRecording();
  record.melody!.overrides = overrides;
  const expected = Uint8Array.from([
    6,
    83,
    104,
    97,
    114,
    101,
    100,
    208,
    15,
    0,
    0,
    0,
    0,
    0,
    0,
    94,
    64,
    4,
    0,
    0,
    25,
    0,
    0,
    0,
    0,
    0,
    0,
    72,
    64,
    0,
    0,
    0,
    0,
    0,
    0,
    88,
    64,
    ...controls,
    2,
    0,
    0,
    244,
    3,
    72,
    0,
    244,
    3,
    244,
    3,
    74,
  ]);
  expect(packTune(createPortableTune(record, []))).toEqual(expected);
  expect(packTune(unpackTune(expected, version))).toEqual(expected);
});

it("bounds curve counts before reading points and rejects curve flags in legacy payloads", () => {
  const record = noteRecording();
  record.noteSource.interpretationVersion = 3;
  const tune = createPortableTune(record, []);
  tune.noteSource.segments[1]!.curve = [
    { position: 0, offset: -3 },
    { position: 1, offset: 0 },
  ];
  const raw = packTune(tune);
  const countOffset = raw.length - 33;
  for (const count of [0, 1, 33, 127]) {
    const changed = raw.slice();
    changed[countOffset] = count;
    expect(() => unpackTune(changed, 3)).toThrow(/curve size/);
  }
  expect(() => unpackTune(raw, 1)).toThrow(/flags/);
  expect(() => unpackTune(raw, 2)).toThrow(/flags/);
  const changed = raw.slice();
  new DataView(changed.buffer).setFloat64(changed.length - 8, 1, true);
  expect(() => unpackTune(changed, 3)).toThrow();
});
