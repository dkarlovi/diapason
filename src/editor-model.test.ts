import { recording } from "./test-support/recording";
import { describe, expect, it } from "vitest";
import {
  sliderValue,
  updateTuning,
  noteAtPoint,
  toggleMuted,
  makeReportInput,
} from "./editor-model";
import { DEFAULT_TUNING } from "./tuning";
import type { NoteItem } from "./recording";

const item: NoteItem = {
  raw: { midi: 69, name: "A4", start: 0.25, duration: 0.5 },
  note: { midi: 69, name: "A4", start: 0.25, duration: 0.5 },
  muted: false,
};

describe("editor calculations", () => {
  it("converts millisecond sliders to seconds without changing other tuning", () => {
    expect(sliderValue("minDurationSec", DEFAULT_TUNING)).toBe(80);
    expect(updateTuning(DEFAULT_TUNING, "minDurationSec", 120)).toEqual({
      ...DEFAULT_TUNING,
      minDurationSec: 0.12,
    });
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
