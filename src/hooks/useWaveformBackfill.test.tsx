import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { decodeAudio } from "../codec";
import type { Recording, AudioRecording } from "../Recording/Recording.type";
import { saveWaveform } from "../Recording/Recording.storage";
import { useWaveformBackfill } from "./useWaveformBackfill";

vi.mock("../codec", () => ({ decodeAudio: vi.fn() }));
vi.mock("../Recording/Recording.storage", () => ({ saveWaveform: vi.fn() }));

function record(id: string): AudioRecording {
  return {
    id,
    name: id,
    createdAt: 1,
    sampleRate: 8000,
    durationSec: 1,
    bpm: 90,
    beatsPerBar: 4,
    audio: new Blob(),
    capture: { gain: 1, peak: 1, noiseFloor: 0, dspOff: true },
  };
}

function useBackfill(records: Recording[]) {
  const [recordings, setRecordings] = useState(records);
  useWaveformBackfill(recordings, setRecordings);
  return { recordings, setRecordings };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(decodeAudio).mockResolvedValue(new Float32Array([0, 0.25, 1]));
  vi.mocked(saveWaveform).mockImplementation(async (_, waveform) => waveform);
});
afterEach(cleanup);

it("shows legacy rows immediately and fills them gradually without decoding stored summaries", async () => {
  const saved = {
    ...record("saved"),
    waveform: { version: 1 as const, rms: new Float32Array([1]) },
  };
  const { result } = renderHook(() => useBackfill([saved, record("first"), record("second")]));
  expect(result.current.recordings).toHaveLength(3);
  expect(decodeAudio).not.toHaveBeenCalled();
  await waitFor(() => expect(result.current.recordings.every((r) => r.waveform)).toBe(true));
  expect(decodeAudio).toHaveBeenCalledTimes(2);
  expect([...result.current.recordings[1]!.waveform!.rms]).toEqual([0, 0.25, 1]);
});

it("bounds decoding to one job and preserves edits made during decoding", async () => {
  let finish!: (pcm: Float32Array<ArrayBuffer>) => void;
  vi.mocked(decodeAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result } = renderHook(() => useBackfill([record("first"), record("second")]));
  await waitFor(() => expect(decodeAudio).toHaveBeenCalledTimes(1));
  act(() =>
    result.current.setRecordings((records) => records.map((r) => ({ ...r, name: "Edited" }))),
  );
  await act(async () => finish(new Float32Array([1])));
  await waitFor(() => expect(result.current.recordings.every((r) => r.waveform)).toBe(true));
  expect(result.current.recordings.every((r) => r.name === "Edited")).toBe(true);
  expect(decodeAudio).toHaveBeenCalledTimes(2);
});

it("continues past failed audio without retrying it repeatedly", async () => {
  vi.mocked(decodeAudio).mockRejectedValueOnce(new Error("bad audio"));
  const { result } = renderHook(() => useBackfill([record("bad"), record("good")]));
  await waitFor(() => expect(result.current.recordings[1]?.waveform).toBeDefined());
  expect(result.current.recordings[0]?.waveform).toBeUndefined();
  expect(decodeAudio).toHaveBeenCalledTimes(2);
});

it("stops backfill on unmount without saving a pending decode", async () => {
  let finish!: (pcm: Float32Array<ArrayBuffer>) => void;
  vi.mocked(decodeAudio).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderHook(() => useBackfill([record("first"), record("second")]));
  await waitFor(() => expect(decodeAudio).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => finish(new Float32Array([1])));
  expect(saveWaveform).not.toHaveBeenCalled();
  expect(decodeAudio).toHaveBeenCalledTimes(1);
});
