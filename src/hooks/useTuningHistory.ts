import { useCallback, useState } from "react";
import type { Recording } from "../db";
import { melodySettingFor, sameMelodySetting } from "../melody/settings";
import { DEFAULT_PLAY } from "../instruments";

/** Keep only tuning intent; callers restore it over the current recording's other data. */
export function useTuningHistory() {
  const [previous, setPrevious] = useState<Recording | null>(null);
  const remember = useCallback((current: Recording | null, next: Recording) => {
    if (!current || current.id !== next.id) {
      setPrevious(null);
      return;
    }
    const before = current.play ?? DEFAULT_PLAY;
    const after = next.play ?? DEFAULT_PLAY;
    if (
      !sameMelodySetting(melodySettingFor(current), melodySettingFor(next)) ||
      before.instrument !== after.instrument ||
      before.octave !== after.octave
    )
      setPrevious(current);
  }, []);
  const clear = useCallback(() => setPrevious(null), []);
  return { previous, remember, clear };
}
