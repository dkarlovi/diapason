import { useEffect, useRef, useState } from "react";
import { CAPTURE_STEPS } from "./CapturePresentation";
import { nextSetupStep, type SetupState, type SetupStep } from "../../Recording/RecordingSetup";

export function useCaptureWizard(setup: SetupState, locked: boolean, stopTempo: () => void) {
  const [editing, setEditing] = useState<SetupStep | null>(null);
  const nextIndex = CAPTURE_STEPS.findIndex((step) => step.id === nextSetupStep(setup));
  const editIndex = CAPTURE_STEPS.findIndex((step) => step.id === editing);
  const activeIndex = editIndex >= 0 && editIndex <= nextIndex ? editIndex : nextIndex;
  const active = CAPTURE_STEPS[activeIndex]!;
  const heading = useRef<HTMLHeadingElement>(null);
  const previousRevision = useRef(setup.revision);
  useEffect(() => {
    if (previousRevision.current !== setup.revision) {
      setEditing(null);
      previousRevision.current = setup.revision;
    }
  }, [setup.revision]);
  useEffect(() => {
    heading.current?.focus();
  }, [active.id]);
  const chooseStep = (step: SetupStep) => {
    if (locked) return;
    stopTempo();
    setEditing(step);
  };
  const advance = (action: () => void) => {
    action();
    setEditing(null);
  };
  const back =
    activeIndex > 0 && !locked ? () => chooseStep(CAPTURE_STEPS[activeIndex - 1]!.id) : undefined;
  return { active, activeIndex, nextIndex, heading, chooseStep, advance, back };
}
