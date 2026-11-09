// @vitest-environment node
import { expect, it } from "vitest";
import { noteRecording } from "../../tests/support/note-recording";
import { processRecording } from "../Recording/Processing";
import { setBendEdit, resetBendEdit } from "./BendEdits";
import { setPitchEdit } from "./NoteEdits";
const points = [
  { position: 0, offset: -7 },
  { position: 0.5, offset: -2 },
  { position: 1, offset: 0 },
];
it("applies manual bends after note correction and preserves automatic evidence on reset", () => {
  const record = noteRecording();
  record.melody = { preset: "as-played", key: "auto", overrides: { glide: 1 } };
  const segment = record.noteSource.segments[0]!;
  record.noteEdits = setBendEdit(undefined, segment, points, "bend");
  record.noteEdits = setPitchEdit(record.noteEdits, segment.source, 78, "pitch");
  const result = processRecording(record, []);
  expect(result.items[0]!.note.midi).toBe(78);
  expect(result.items[0]!.note.bend?.points).toEqual(points);
  expect(result.items[0]!.editState.axes).toEqual(["pitch", "bend"]);
  record.noteEdits = resetBendEdit(record.noteEdits, segment.source);
  expect(processRecording(record, []).items[0]!.note.bend).toBeUndefined();
  expect(processRecording(record, []).items[0]!.note.midi).toBe(78);
});
