import { analyzeBuffer } from "./recorder";
import { packFrames } from "./analysis-cache";
import type { AnalysisRequest, AnalysisMessage } from "./analysis-runner";

// Worker-specific postMessage overload without adding WebWorker globals to the app's DOM types.
const scope = self as unknown as {
  onmessage: (event: MessageEvent<AnalysisRequest>) => void;
  postMessage(message: AnalysisMessage, transfer?: ArrayBuffer[]): void;
};
scope.onmessage = ({ data }) => {
  try {
    const frames = packFrames(
      analyzeBuffer(data.samples, data.sampleRate, data.options, (done, total) => {
        scope.postMessage({ type: "progress", done, total });
      }),
    );
    scope.postMessage({ type: "result", frames }, [frames.buffer]);
  } catch (error) {
    scope.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
