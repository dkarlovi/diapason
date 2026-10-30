import type { AnalysisState } from "../analysis-jobs";
import { Button } from "../UI/Primitives";

export function AnalysisProgress({ state, retry }: { state: AnalysisState; retry(): void }) {
  if (state.status === "error")
    return (
      <div className="analysis-status analysis-error">
        <span role="alert">Analysis failed: {state.error}</span>
        <Button onClick={retry}>Retry analysis</Button>
      </div>
    );
  if (state.cacheWarning)
    return (
      <p className="analysis-status" role="status">
        Analysis ready. Could not save cache: {state.cacheWarning}. Reopening may analyze again.
      </p>
    );
  if (state.status !== "running") return null;
  return (
    <div className="analysis-status">
      <span>Analyzing… {state.progress}%</span>
      <div
        className="analysis-progress"
        role="progressbar"
        aria-label="Pitch analysis"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.progress}
        aria-valuetext={`Analyzing… ${state.progress}%`}
      >
        <span style={{ width: `${state.progress}%` }} />
      </div>
    </div>
  );
}
