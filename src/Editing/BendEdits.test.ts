// @vitest-environment node
import { expect, it } from "vitest";
import { setBendEdit, resetBendEdit, bendEditFor } from "./BendEdits";
import { isNoteEdits, setPitchEdit, resetPitchEdit, protectedNoteBoundaries } from "./NoteEdits";
import type { Segment } from "../Melody/Decode.type";
const segment: Segment = {
  start: 1,
  duration: 2,
  pitch: 76,
  source: { start: 1, end: 3 },
  curve: [
    { position: 0, offset: -4 },
    { position: 1, offset: 0 },
  ],
};
const points = [
  { position: 0, offset: -7 },
  { position: 0.5, offset: -2 },
  { position: 1, offset: 0 },
];
it("keeps independent pitch and bend edits and resets each axis independently", () => {
  const pitch = setPitchEdit(undefined, segment.source, 78, "pitch");
  const both = setBendEdit(pitch, segment, points, "bend");
  expect(isNoteEdits(both, 4)).toBe(true);
  expect(bendEditFor(both, segment.source)?.points).toEqual(points);
  expect(resetPitchEdit(both, segment.source).bend).toEqual(both.bend);
  expect(resetBendEdit(both, segment.source).pitch).toEqual(pitch.pitch);
  expect(protectedNoteBoundaries(both)).toEqual([1, 3]);
});
it("rejects malformed bends and overlapping curve edits", () => {
  const edits = setBendEdit(undefined, segment, points, "bend");
  expect(isNoteEdits({ ...edits, bend: [...edits.bend!, ...edits.bend!] }, 4)).toBe(false);
  expect(() =>
    setBendEdit(
      undefined,
      segment,
      [
        { position: 0, offset: NaN },
        { position: 1, offset: 0 },
      ],
      "bad",
    ),
  ).toThrow();
  expect(() => setBendEdit(undefined, segment, points, " ")).toThrow();
});
it("keeps the automatic source contour separate from the edited curve", () => {
  const edits = setBendEdit(undefined, segment, points, "bend");
  expect(edits.bend![0]!.segment.curve).toEqual(segment.curve);
  expect(edits.bend![0]!.points).toEqual(points);
  expect(segment.curve![0]!.offset).toBe(-4);
});
it("rejects a pitch edit ID already owned by a bend", () => {
  const edits = setBendEdit(undefined, segment, points, "shared");
  expect(() => setPitchEdit(edits, segment.source, 78, "shared")).toThrow(/duplicate/);
});
