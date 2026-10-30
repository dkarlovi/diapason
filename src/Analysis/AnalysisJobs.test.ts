import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { getAnalysisState, requestAnalysis, subscribeAnalysis } from "./AnalysisJobs";
import { putRecording } from "../Recording/Recording.storage";
import { analysisKey, readAnalysis } from "./AnalysisCache.storage";
import { recording } from "../../tests/support/recording";
import * as recorder from "../Audio/Recorder";

vi.mock("../Audio/Codec", () => ({ decodeAudio: async () => new Float32Array(4096) }));
afterEach(() => vi.unstubAllGlobals());

it("shares one in-flight analysis and reopens from persistent frames without detecting again", async () => {
  const record = recording({ id: "reuse" });
  await putRecording(record);
  const analyze = vi.spyOn(recorder, "analyzeBuffer");
  const first = requestAnalysis(record);
  expect(requestAnalysis(record)).toBe(first);
  const frames = await first;
  expect(frames).toHaveLength(5);
  expect(getAnalysisState(analysisKey(record), record.id).status).toBe("ready");
  expect(await requestAnalysis(record)).toEqual(frames);
  expect(analyze).toHaveBeenCalledTimes(1);
  analyze.mockRestore();
});

it("transfers PCM to a worker, shares progress, persists frames, and cleans up", async () => {
  const record = recording({ id: "worker" });
  await putRecording(record);
  const workers: WorkerDouble[] = [];
  class WorkerDouble {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: ((event: { message: string; preventDefault(): void }) => void) | null = null;
    onmessageerror = null;
    terminate = vi.fn();
    postMessage = vi.fn((data: { samples: Float32Array }, transfer: ArrayBuffer[]) => {
      expect(transfer).toEqual([data.samples.buffer]);
      queueMicrotask(() => this.onmessage?.({ data: { type: "progress", done: 2, total: 5 } }));
    });
    constructor() {
      workers.push(this);
    }
  }
  vi.stubGlobal("Worker", WorkerDouble);
  const changed = vi.fn();
  const off = subscribeAnalysis(changed);
  const pending = requestAnalysis(record);
  await vi.waitFor(() =>
    expect(getAnalysisState(analysisKey(record), record.id).progress).toBe(40),
  );
  expect(requestAnalysis(record)).toBe(pending);
  workers[0]!.onmessage?.({
    data: { type: "result", frames: new Float64Array([0, 440.123456789, 0.99, 0.1]) },
  });
  expect(await pending).toEqual([{ t: 0, freq: 440.123456789, clarity: 0.99, rms: 0.1 }]);
  expect(await readAnalysis(record)).toEqual(await pending);
  expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalled();
  off();
});

it("reports worker errors and retries explicitly instead of leaving progress stuck", async () => {
  const record = recording({ id: "retry" });
  await putRecording(record);
  vi.stubGlobal(
    "Worker",
    class {
      constructor() {
        throw new Error("Worker blocked");
      }
    },
  );
  await expect(requestAnalysis(record)).rejects.toThrow("Worker blocked");
  expect(getAnalysisState(analysisKey(record), record.id)).toMatchObject({
    status: "error",
    error: "Worker blocked",
  });
  vi.stubGlobal("Worker", undefined);
  expect(await requestAnalysis(record, true)).toHaveLength(5);
  expect(getAnalysisState(analysisKey(record), record.id).status).toBe("ready");
});

it("reanalyzes changed options once and replaces entries from older implementations", async () => {
  const record = recording({ id: "invalidate" });
  await putRecording(record);
  const analyze = vi.spyOn(recorder, "analyzeBuffer");
  await requestAnalysis(record);
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
  await putRecording(changed);
  expect(await requestAnalysis(changed)).toHaveLength(9);
  expect(await requestAnalysis(changed)).toHaveLength(9);
  const { databaseTransaction } = await import("../Storage/Database");
  await databaseTransaction(["analysis"], "readwrite", (tx, done) => {
    tx.objectStore("analysis").put({
      id: record.id,
      key: analysisKey(changed, 0),
      frames: new Float64Array(),
    });
    done(undefined);
  });
  expect(await requestAnalysis(changed)).toHaveLength(9);
  expect(await requestAnalysis(changed)).toHaveLength(9);
  expect(analyze).toHaveBeenCalledTimes(3);
  analyze.mockRestore();
});

it("keeps analyzed frames usable when the browser cannot persist the cache", async () => {
  const record = recording({ id: "quota" });
  await putRecording(record);
  const cache = await import("./AnalysisCache.storage");
  const save = vi
    .spyOn(cache, "writeAnalysis")
    .mockRejectedValue(new DOMException("Storage is full", "QuotaExceededError"));
  expect(await requestAnalysis(record)).toHaveLength(5);
  expect(getAnalysisState(analysisKey(record), record.id)).toMatchObject({
    status: "ready",
    cacheWarning: "Storage is full",
  });
  save.mockRestore();
});
