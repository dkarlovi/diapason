import type { AudioRecording as Recording } from "../Recording/Recording.type";
import type { Frame } from "../Melody/Notes";
import { analysisKey, readAnalysis, writeAnalysis } from "./AnalysisCache.storage";
import { resolveAnalysisOptions } from "./RecordingAnalysis";
import { decodeAudio } from "../Audio/Codec";
import { runAnalysis } from "./AnalysisRunner";

export interface AnalysisState {
  status: "idle" | "running" | "ready" | "error";
  progress: number;
  error?: string;
  cacheWarning?: string;
}
const idle: AnalysisState = { status: "idle", progress: 0 };
const states = new Map<string, AnalysisState>();
const jobs = new Map<string, Promise<Frame[]>>();
const listeners = new Set<() => void>();
// Bound CPU/memory usage when several previews are requested in quick succession.
let queue: Promise<unknown> = Promise.resolve();
const jobKey = (key: string, id: string) => JSON.stringify([id, key]);
export const getAnalysisState = (key: string, id: string): AnalysisState =>
  states.get(jobKey(key, id)) ?? idle;
export function subscribeAnalysis(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function publish(key: string, state: AnalysisState) {
  states.set(key, state);
  listeners.forEach((listener) => listener());
}

/** Shared across screen lifetimes; only in-flight jobs retain frames/PCM. */
export function requestAnalysis(record: Recording, retry = false): Promise<Frame[]> {
  const key = jobKey(analysisKey(record), record.id);
  const existing = jobs.get(key);
  if (existing) return existing;
  const state = states.get(key);
  if (state?.status === "error" && !retry) return Promise.reject(new Error(state.error));
  publish(key, { status: "running", progress: 0 });
  const job = (async () => {
    try {
      let frames = await readAnalysis(record);
      let cacheWarning: string | undefined;
      if (!frames) {
        const run = async () => {
          const samples = await decodeAudio(record.audio);
          return runAnalysis(
            { samples, sampleRate: record.sampleRate, options: resolveAnalysisOptions(record) },
            (done, total) => {
              const progress = total ? Math.min(99, Math.floor((done / total) * 100)) : 0;
              if (states.get(key)?.progress !== progress)
                publish(key, { status: "running", progress });
            },
          );
        };
        const work = queue.then(run);
        queue = work.then(
          () => undefined,
          () => undefined,
        );
        frames = await work;
        try {
          await writeAnalysis(record, frames);
        } catch (error) {
          cacheWarning = error instanceof Error ? error.message : String(error);
        }
      }
      publish(key, { status: "ready", progress: 100, ...(cacheWarning ? { cacheWarning } : {}) });
      return frames;
    } catch (error) {
      publish(key, {
        status: "error",
        progress: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      jobs.delete(key);
    }
  })();
  jobs.set(key, job);
  return job;
}
