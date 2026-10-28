// @vitest-environment node
import { expect, it } from "vitest";
import { TuneReader, TuneWriter } from "./tune-binary";
import { packTune, unpackTune } from "./tune-fields";
import { createPortableTune, validatePortableTune, TUNE_LIMITS } from "./portable-tune";
import { noteRecording } from "./test-support/note-recording";
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
