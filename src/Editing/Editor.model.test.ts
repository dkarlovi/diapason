import { recording } from "../../tests/support/recording";
import { describe, expect, it } from "vitest";
import {
  knobValueLabel,
  noteAtPoint,
  toggleMuted,
  makeReportInput,
  selectedSourceItem,
  draggedPitch,
  hitsSelectedNote,
  bendHandleAtPoint,
} from "./Editor.model";
import { KNOB_DEFS } from "../Melody/Knobs";
import type { NoteItem } from "../Recording/NoteItem.type";

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

it("hits the sounding contour and raw editable handles independently of glide", () => {
  const points = [
    { position: 0, offset: -12 },
    { position: 0.5, offset: 6 },
    { position: 1, offset: 0 },
  ];
  const curved = { ...item, note: { ...item.note, bend: { points, glide: 1 } } };
  const view = { tMin: 0, tMax: 1, midiMin: 55, midiMax: 79 };
  const point = { x: 25, y: (79 - 57) * 10, width: 100, height: 240 };
  expect(noteAtPoint([curved], view, point)).toBe(curved);
  expect(hitsSelectedNote(curved, view, point)).toBe(true);
  expect(noteAtPoint([curved], view, { ...point, y: 100 })).toBeNull();
  expect(bendHandleAtPoint(curved, points, view, point)).toBe(0);
  expect(bendHandleAtPoint(curved, points, view, { ...point, x: 50, y: 40 })).toBe(1);
  expect(bendHandleAtPoint(curved, points, view, { ...point, x: 75, y: 100 })).toBeNull();
});

it("hits descending stepped blocks, including a transposed contour, and preserves item identity", () => {
  const curved = {
    ...item,
    note: {
      ...item.note,
      midi: 81,
      bend: {
        glide: 0.4,
        points: [
          { position: 0, offset: 12 },
          { position: 1, offset: 0 },
        ],
      },
    },
  };
  const view = { tMin: 0, tMax: 1, midiMin: 79, midiMax: 95 };
  expect(noteAtPoint([curved], view, { x: 25, y: 20, width: 100, height: 160 })).toBe(curved);
  expect(hitsSelectedNote(curved, view, { x: 25, y: 20, width: 100, height: 160 })).toBe(true);
  expect(noteAtPoint([curved], view, { x: 50, y: 80, width: 100, height: 160 })).toBe(curved);
  expect(hitsSelectedNote(curved, view, { x: 25, y: 140, width: 100, height: 160 })).toBe(false);
});
it("labels the four effective Glide modes", () => {
  const glideDef = KNOB_DEFS.find((candidate) => candidate.key === "glide")!;
  expect(knobValueLabel(glideDef, 0)).toBe("None · 0%");
  expect(knobValueLabel(glideDef, 0.2)).toBe("Coarse steps · 20%");
  expect(knobValueLabel(glideDef, 0.4)).toBe("Fine steps · 40%");
  expect(knobValueLabel(glideDef, 0.7)).toBe("Smooth · 70%");
});
