import type { useCapture } from "../hooks/useCapture";
import { pitchLabel } from "../voice-range";
import { Button, Field } from "../UI/Primitives";
import { CaptureActions } from "./CaptureActions";
import { StatusChecklist } from "./StatusChecklist";

export function VoiceSoundCheck({
  state,
  back,
  onContinue,
}: {
  state: ReturnType<typeof useCapture>;
  back: (() => void) | undefined;
  onContinue: () => void;
}) {
  const { voice, soundTarget, sound } = state.setup;
  const complete = sound?.pass === true;
  const next = voice.low?.pass ? "high" : "low";
  const defaultCheck = state.measuring === "sound" && !soundTarget;
  const current = voice[next];
  const failed = current?.checks.filter((check) => check.status === "attention") ?? [];
  const copy = soundCheckCopy({
    complete,
    defaultCheck,
    measuring: !!state.measuring,
    next,
    retry: !!current,
  });
  return (
    <>
      <div className="capture-step-body">
        <p className="setup-instruction">{copy.instruction}</p>
        <VoiceRangeReadout state={state} complete={complete} next={next} />
        {state.measuring && (
          <progress
            className="measurement-progress"
            aria-label={soundTarget ? `Measuring ${soundTarget} note` : "Checking sound"}
            value={state.measurements.progress}
            max={1}
          />
        )}
        <StatusChecklist checks={sound?.checks ?? failed} />
        {!complete && (
          <div className="row device-actions">
            <Button
              disabled={!!state.measuring}
              aria-label="Use default range and check sound"
              title="Check a steady note using the full singing / humming range"
              onClick={() => void state.checkSound()}
            >
              Use default range
            </Button>
          </div>
        )}
      </div>
      <CaptureActions back={back}>
        <Button
          variant="primary"
          disabled={!!state.measuring}
          onClick={complete ? onContinue : () => void state.checkEndpoint(next)}
        >
          {copy.action}
        </Button>
      </CaptureActions>
    </>
  );
}

function VoiceRangeReadout({
  state,
  complete,
  next,
}: {
  state: ReturnType<typeof useCapture>;
  complete: boolean;
  next: "low" | "high";
}) {
  const { voice, soundTarget } = state.setup;
  return (
    <>
      {(["low", "high"] as const).map((target) => {
        const result = voice[target];
        const active = state.measuring === "sound" && soundTarget === target;
        return (
          <Field
            key={target}
            label={target === "low" ? "Lowest note" : "Highest note"}
            htmlFor={`voice-${target}`}
          >
            <div className="voice-range-value">
              <output id={`voice-${target}`}>
                {result?.frequency
                  ? pitchLabel(result.frequency)
                  : active
                    ? "Measuring…"
                    : "Not measured"}
              </output>
              {result && (complete || target !== next) && (
                <Button
                  disabled={!!state.measuring}
                  aria-label={`Retry ${target} note`}
                  onClick={() => void state.checkEndpoint(target)}
                >
                  Retry
                </Button>
              )}
            </div>
          </Field>
        );
      })}
    </>
  );
}

function soundCheckCopy({
  complete,
  defaultCheck,
  measuring,
  next,
  retry,
}: {
  complete: boolean;
  defaultCheck: boolean;
  measuring: boolean;
  next: "low" | "high";
  retry: boolean;
}) {
  if (complete) return { instruction: "Your sound is ready.", action: "Continue" };
  if (defaultCheck)
    return {
      instruction: "Sing or hum a steady note at your normal volume.",
      action: "Checking… keep sounding",
    };
  return {
    instruction: `Hold your ${next === "low" ? "lowest" : "highest"} comfortable note for two seconds, without straining.`,
    action: measuring ? "Measuring… hold your note" : `${retry ? "Retry" : "Measure"} ${next} note`,
  };
}
