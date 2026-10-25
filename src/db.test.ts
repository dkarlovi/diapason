import { afterEach, expect, it, vi } from "vitest";
import { storageEstimate } from "./db";
import "fake-indexeddb/auto";
import { deleteRecording, getRecording, putRecording, saveWaveform, type Recording } from "./db";
afterEach(() => vi.unstubAllGlobals());
it("reports browser storage usage and tolerates unavailable estimates", async () => {
  vi.stubGlobal("navigator", { storage: { estimate: async () => ({ usage: 100, quota: 1000 }) } });
  expect(await storageEstimate()).toEqual({ usage: 100, quota: 1000 });
  vi.stubGlobal("navigator", {});
  expect(await storageEstimate()).toBeNull();
});

it("loads legacy records and persists typed waveform data without replacing newer edits", async () => {
  const record: Recording = {
    id: "legacy",
    name: "Original",
    createdAt: 1,
    sampleRate: 8000,
    durationSec: 1,
    bpm: 90,
    beatsPerBar: 4,
    audio: new Blob(),
    capture: { gain: 1, peak: 1, noiseFloor: 0, dspOff: true },
  };
  await putRecording(record);
  expect((await getRecording(record.id))?.waveform).toBeUndefined();
  await putRecording({ ...record, name: "Renamed", bpm: 120, muted: [{ t: 0.5, midi: 60 }] });
  const waveform = { version: 1 as const, rms: new Float32Array([0, 0.25, 1]) };
  await saveWaveform(record.id, waveform);
  const loaded = await getRecording(record.id);
  expect(loaded).toMatchObject({ name: "Renamed", bpm: 120, muted: [{ t: 0.5, midi: 60 }] });
  expect(Object.prototype.toString.call(loaded?.waveform?.rms)).toBe("[object Float32Array]");
  expect([...loaded!.waveform!.rms]).toEqual([0, 0.25, 1]);
  await saveWaveform(record.id, { version: 1, rms: new Float32Array([0]) });
  expect([...(await getRecording(record.id))!.waveform!.rms]).toEqual([0, 0.25, 1]);
  await deleteRecording(record.id);
  expect(await saveWaveform(record.id, waveform)).toBeUndefined();
  expect(await getRecording(record.id)).toBeUndefined();
});
