import { describe, expect, it } from "vitest";
import {
  isNoteEdits,
  pitchEditFor,
  protectedNoteBoundaries,
  resetPitchEdit,
  setPitchEdit,
} from "./note-edits";
const range = (start: number, end: number) => ({ start, end });
describe("source pitch intent", () => {
  it("inherits through splits and resets only the selected child", () => {
    const original = setPitchEdit(undefined, range(0, 2), 73, "parent");
    const snapshot = JSON.stringify(original);
    expect(pitchEditFor(original, range(0, 1))?.id).toBe("parent");
    expect(pitchEditFor(original, range(1, 2))?.id).toBe("parent");
    const right = resetPitchEdit(original, range(0, 1));
    expect(right.pitch).toEqual([{ id: "parent", midi: 73, ranges: [range(1, 2)] }]);
    const both = setPitchEdit(right, range(0, 1), 75, "left");
    expect(pitchEditFor(both, range(0, 1))?.midi).toBe(75);
    expect(pitchEditFor(both, range(1, 2))?.midi).toBe(73);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(protectedNoteBoundaries(both)).toEqual([0, 1, 2]);
  });
  it("retains fragments and IDs, removes empty records and ignores boundary contact", () => {
    const edits = setPitchEdit(undefined, range(0, 3), 73, "a");
    expect(resetPitchEdit(edits, range(1, 2)).pitch[0]?.ranges).toEqual([range(0, 1), range(2, 3)]);
    expect(resetPitchEdit(edits, range(3, 4))).toEqual(edits);
    expect(resetPitchEdit(edits, range(0, 3))).toEqual({ version: 1, pitch: [] });
    const middle = setPitchEdit(undefined, range(1, 2), 73, "a");
    expect(pitchEditFor(middle, range(0, 1))).toBeUndefined();
    expect(pitchEditFor(middle, range(2, 3))).toBeUndefined();
    expect(() => pitchEditFor(middle, range(0, 2))).toThrow(/coverage|cross/i);
  });
  it.each([
    [0, 0],
    [-1, 1],
    [0, Infinity],
    [NaN, 1],
  ])("rejects invalid ranges %s %s", (start, end) => {
    expect(() => setPitchEdit(undefined, range(start, end), 73, "a")).toThrow();
    expect(() => resetPitchEdit(undefined, range(start, end))).toThrow();
  });
  it.each([-1, 128, 73.5, NaN])("rejects invalid MIDI %s", (midi) => {
    expect(() => setPitchEdit(undefined, range(0, 1), midi, "a")).toThrow();
  });
  it("validates versions, IDs, ordering, duration and competing coverage", () => {
    const edits = setPitchEdit(undefined, range(0, 2), 73, "a");
    expect(isNoteEdits(edits, 2)).toBe(true);
    expect(isNoteEdits(edits, 1)).toBe(false);
    expect(isNoteEdits({ ...edits, version: 2 }, 2)).toBe(false);
    expect(isNoteEdits({ version: 1, pitch: [...edits.pitch, ...edits.pitch] }, 2)).toBe(false);
    expect(() => setPitchEdit(edits, range(2, 3), 75, "a")).toThrow();
    expect(
      isNoteEdits(
        { version: 1, pitch: [{ id: "b", midi: 70, ranges: [range(1, 2), range(0, 1)] }] },
        2,
      ),
    ).toBe(false);
    expect(isNoteEdits({ version: 1, pitch: [{ id: "", midi: 70, ranges: [] }] }, 2)).toBe(false);
  });
});
