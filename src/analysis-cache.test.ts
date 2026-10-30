import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import { analysisKey, readAnalysis, writeAnalysis } from "./analysis-cache";
import { deleteRecording, putRecording } from "./Recording/Recording.storage";
import { recording } from "../tests/support/recording";

it("stores exact frames separately and deletes them with the recording", async () => {
  const record = recording({ id: "cached" });
  const frames = [
    { t: 512 / 48000, freq: 440.123456789, clarity: 0.987654321, rms: 0.123456789 },
    { t: 1024 / 48000, freq: null, clarity: 0, rms: 0 },
  ];
  await putRecording(record);
  await writeAnalysis(record, frames);
  expect(await readAnalysis(record)).toEqual(frames);
  expect(await readAnalysis({ ...record, sampleRate: 44100 })).toBeUndefined();
  await deleteRecording(record.id);
  expect(await readAnalysis(record)).toBeUndefined();
  await writeAnalysis(record, frames);
  expect(await readAnalysis(record)).toBeUndefined();
});

it("invalidates the cache when analysis options or implementation change", async () => {
  const record = recording({ id: "options" });
  await putRecording(record);
  await writeAnalysis(record, []);
  const changed = {
    ...record,
    source: {
      profileId: "whistle",
      analysis: {
        windowSize: 2048,
        hop: 256,
        minFreq: 250,
        maxFreq: 3000,
        clarityThreshold: 0.9,
      },
    },
  };
  expect(await readAnalysis(changed)).toBeUndefined();
  expect(analysisKey(record, 1)).not.toBe(analysisKey(record, 2));
});
