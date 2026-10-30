import "fake-indexeddb/auto";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Recording } from "../Recording/Recording.type";
import type { NoteEvent } from "../notes";
import { useLibrary } from "./useLibrary";
const state = vi.hoisted(() => ({ record: null as Recording | null, played: [] as NoteEvent[][] }));
vi.mock("../Recording/Recording.storage", () => ({
  allRecordings: async () => [state.record],
  storageEstimate: async () => null,
  deleteRecording: async () => {},
  getRecording: async () => state.record,
  putRecording: async () => {},
  saveWaveform: async () => undefined,
}));
vi.mock("../codec", () => ({
  decodeAudio: async () =>
    Float32Array.from({ length: 8000 }, (_, i) => 0.1 * Math.sin((2 * Math.PI * 220 * i) / 8000)),
}));
vi.mock("../playback", () => ({
  playNotes: (notes: NoteEvent[]) => {
    state.played.push(notes);
    return { position: () => 0, stop: () => {} };
  },
  playPcm: () => ({ position: () => 0, stop: () => {} }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uses stored source options for library playback and invalidates cached analysis when options change", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  state.played = [];
  state.record = {
    id: "source",
    name: "Melody",
    createdAt: 1,
    sampleRate: 8000,
    durationSec: 1,
    bpm: 90,
    beatsPerBar: 4,
    audio: new Blob(),
    capture: { gain: 1, peak: 0.1, noiseFloor: 0.001, dspOff: true },
    tuning: {},
    source: {
      profileId: "whistle",
      analysis: { minFreq: 100, maxFreq: 500, windowSize: 512, hop: 128, clarityThreshold: 0.9 },
    },
  };
  const { result } = renderHook(useLibrary);
  await act(async () => {});
  expect(result.current.recordings).toHaveLength(1);
  await act(async () => {
    await result.current.togglePlay(state.record!, "midi");
  });
  expect(result.current.playing).toEqual({ id: "source", kind: "midi" });
  expect(state.played[0]!.length).toBeGreaterThan(0);
  expect(state.played[0]!.every((note) => note.midi === 57)).toBe(true);
  await act(async () => {
    await result.current.togglePlay(state.record!, "midi");
  });
  expect(result.current.playing).toBeNull();
  state.record.source!.analysis.clarityThreshold = 1;
  await act(async () => {
    await result.current.togglePlay(state.record!, "midi");
  });
  expect(state.played[1]).toEqual([]);
});
