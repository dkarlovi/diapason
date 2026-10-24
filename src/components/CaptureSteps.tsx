import { CAPTURE_STEPS, stepSummary } from "../capture-presentation";
import type { SetupState, SetupStep } from "../recording-setup";

export function CaptureSteps({
  setup,
  active,
  nextIndex,
  locked,
  microphone,
  onChoose,
}: {
  setup: SetupState;
  active: SetupStep;
  nextIndex: number;
  locked: boolean;
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
          aria-current={active === step.id ? "step" : undefined}
          aria-label={index < nextIndex ? `Edit ${step.title}` : `Step ${index + 1}: ${step.title}`}
          disabled={locked || index > nextIndex}
          onClick={() => onChoose(step.id)}
        >
          <span className="step-number">{index + 1}</span>
          <span className="step-name">{step.label}</span>
          <small title={stepSummary(step.id, setup, microphone)}>
            {stepSummary(step.id, setup, microphone)}
          </small>
        </button>
      ))}
    </nav>
  );
}
