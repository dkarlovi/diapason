import { CAPTURE_STEPS, compactStepSummary, stepSummary } from "../capture-presentation";
import type { SetupState, SetupStep } from "../recording-setup";
import { DiapasonMark } from "../UI/DiapasonMark";

export function CaptureSteps({
  setup,
  active,
  nextIndex,
  locked,
  recording,
  microphone,
  onChoose,
}: {
  setup: SetupState;
  active: SetupStep;
  nextIndex: number;
  locked: boolean;
  recording: boolean;
  microphone: string;
  onChoose(step: SetupStep): void;
}) {
  return (
    <nav className="capture-steps" aria-label="Recording steps">
      {CAPTURE_STEPS.map((step, index) => (
        <button
          key={step.id}
          type="button"
          className="capture-step"
          data-step={step.id}
          data-completed={index < nextIndex}
          aria-current={active === step.id ? "step" : undefined}
          aria-label={index < nextIndex ? `Edit ${step.title}` : `Step ${index + 1}: ${step.title}`}
          disabled={locked || index > nextIndex}
          onClick={() => onChoose(step.id)}
        >
          <span className="step-number" aria-hidden="true">
            {recording && step.id === "record" ? (
              <DiapasonMark />
            ) : index < nextIndex ? (
              "✓"
            ) : (
              index + 1
            )}
          </span>
          <span className="step-name">
            <span className="step-text-full">{step.label}</span>
            <span className="step-text-compact">{step.compactLabel ?? step.label}</span>
          </span>
          <small title={stepSummary(step.id, setup, microphone)}>
            <span className="step-text-full">{stepSummary(step.id, setup, microphone)}</span>
            <span className="step-text-compact">
              {compactStepSummary(step.id, setup, microphone)}
            </span>
          </small>
        </button>
      ))}
    </nav>
  );
}
