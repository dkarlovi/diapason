import { analyzeBuffer, type AnalyzeOptions } from "./recorder";
import type { Frame } from "./notes";
import { unpackFrames } from "./analysis-cache";

export interface AnalysisRequest {
  samples: Float32Array<ArrayBuffer>;
  sampleRate: number;
  options: AnalyzeOptions;
}
export type AnalysisMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "result"; frames: Float64Array }
  | { type: "error"; error: string };

/** Owns samples: transferring them must never detach a playback buffer. */
export function runAnalysis(
  request: AnalysisRequest,
  progress: (done: number, total: number) => void,
): Promise<Frame[]> {
  if (typeof Worker === "undefined")
    return Promise.resolve(
      analyzeBuffer(request.samples, request.sampleRate, request.options, progress),
    );
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./analysis-worker.ts", import.meta.url), { type: "module" });
    const finish = (error?: string, frames?: Frame[]) => {
      worker.terminate();
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      if (error) reject(new Error(error));
      else resolve(frames!);
    };
    worker.onmessage = (event: MessageEvent<AnalysisMessage>) => {
      const message = event.data;
      if (message.type === "progress") progress(message.done, message.total);
      else if (message.type === "error") finish(message.error);
      else finish(undefined, unpackFrames(message.frames));
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish(event.message || "Analysis worker failed");
    };
    worker.onmessageerror = () => finish("Could not read analysis worker response");
    try {
      worker.postMessage(request, [request.samples.buffer]);
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
  });
}
