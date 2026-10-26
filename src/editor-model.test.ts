import { recording } from "./test-support/recording";
import { describe, expect, it } from "vitest";
import {
  knobValueLabel,
  noteAtPoint,
  toggleMuted,
  makeReportInput,
  selectedSourceItem,
  draggedPitch,
  withDraftPitch,
} from "./editor-model";
import { KNOB_DEFS } from "./melody/knobs";
import type { NoteItem } from "./recording";

const item: NoteItem = {
  source: { start: 0.25, end: 0.75 },
  automatic: { midi: 69, name: "A4", start: 0.25, duration: 0.5 },
  editState: { ids: [], axes: [], differingAxes: [] },
  id: 1,
  raw: { midi: 69, name: "A4", start: 0.25, duration: 0.5 },
  note: { midi: 69, name: "A4", start: 0.25, duration: 0.5 },
  muted: false,
};

describe("editor calculations", () => {
  it("labels melody controls with their units and choices", () => {
    expect(
      knobValueLabel(
        KNOB_DEFS.find((def) => def.key === "minNoteMs")!,
        120,
      ),
    ).toBe("120 ms");
    expect(
      knobValueLabel(
        KNOB_DEFS.find((def) => def.key === "grid")!,
        2,
      ),
    ).toBe("Eighth notes");
  });

  it("finds the note under a point in the roll", () => {
    const view = { tMin: 0, tMax: 1, midiMin: 67, midiMax: 71 };
    expect(noteAtPoint([item], view, { x: 50, y: 50, width: 100, height: 100 })).toBe(item);
    expect(noteAtPoint([item], view, { x: 5, y: 50, width: 100, height: 100 })).toBeNull();
  });

  it("stores mute anchors on raw notes and removes them when unmuted", () => {
    expect(toggleMuted([], item)).toEqual([{ t: 0.5, midi: 69 }]);
    expect(toggleMuted([{ t: 0.5, midi: 69 }], { ...item, muted: true })).toEqual([]);
  });

  it("builds diagnostics input from a recording without UI state", () => {
    const rec = recording({ name: "Melody", durationSec: 2 });
    const stats = { voicedRatio: 1, medianClarity: 0.99, centsStd: 0, clipped: false, peak: 0.2 };
    expect(makeReportInput(rec, [], stats)).toMatchObject({
      title: "Melody",
      sampleRate: 48000,
      rmsGate: 0.003,
      stats,
    });
  });
});

it("selects by half-open source containment independently of output pitch and time", () => {
  const shifted = { ...item, note: { ...item.note, midi: 75, start: 2 } };
  expect(selectedSourceItem([shifted], 0.5)).toBe(shifted);
  expect(selectedSourceItem([shifted], 0.75)).toBeUndefined();
  expect(selectedSourceItem([], 0.5)).toBeUndefined();
});
it("retains a source reference through splits and temporary disappearance", () => {
  const left = { ...item, source: { start: 0.25, end: 0.5 } };
  const right = { ...item, id: 2, source: { start: 0.5, end: 0.75 } };
  expect(selectedSourceItem([left, right], 0.5)).toBe(right);
  expect(selectedSourceItem([left], 0.5)).toBeUndefined();
  expect(selectedSourceItem([left, right], 0.5)).toBe(right);
});

it("snaps dragged pitch to semitones within the MIDI range", () => {
  expect(draggedPitch(69, -13, 25)).toBe(70);
  expect(draggedPitch(69, 12, 25)).toBe(69);
  expect(draggedPitch(69, 60, 25)).toBe(67);
  expect(draggedPitch(126, -500, 25)).toBe(127);
  expect(draggedPitch(1, 500, 25)).toBe(0);
});
it("shows a draft pitch on the selected item only and marks it as it will be saved", () => {
  const other = { ...item, id: 2 };
  const items = [item, other];
  expect(withDraftPitch(items, item, null)).toBe(items);
  expect(withDraftPitch(items, undefined, 70)).toBe(items);
  const [raised, untouched] = withDraftPitch(items, item, 71);
  expect(raised?.note).toMatchObject({ midi: 71, name: "B4" });
  expect(raised?.editState.differingAxes).toEqual(["pitch"]);
  expect(untouched).toBe(other);
  const edited = {
    ...item,
    editState: { ids: ["a"], axes: ["pitch" as const], differingAxes: [] },
  };
  expect(withDraftPitch([edited], edited, 69)[0]?.editState.axes).toEqual([]);
});
