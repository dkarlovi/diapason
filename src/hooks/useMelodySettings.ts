import { useCallback, useRef, type RefObject } from "react";
import { putRecording, type Recording } from "../db";
import { melodySettingFor, type MelodySetting } from "../melody/settings";
import { isKnobs, type Knobs, type PresetId } from "../melody/knobs";
import type { KeyChoice } from "../melody/interpret";
export function useMelodySettings(
  recordRef: RefObject<Recording | null>,
  replace: (next: Recording) => void,
) {
  const timer = useRef(0),
    dirty = useRef(false);
  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    if (!dirty.current) return;
    dirty.current = false;
    if (recordRef.current) void putRecording(recordRef.current);
  }, [recordRef]);
  const update = useCallback(
    (change: (setting: MelodySetting) => MelodySetting, immediate = false) => {
      const current = recordRef.current;
      if (!current) return;
      const next = { ...current, melody: change(melodySettingFor(current)) };
      replace(next);
      dirty.current = true;
      window.clearTimeout(timer.current);
      if (immediate) flush();
      else timer.current = window.setTimeout(flush, 300);
    },
    [recordRef, replace, flush],
  );
  const applyPreset = useCallback(
    (preset: PresetId) => update((setting) => ({ ...setting, preset, overrides: {} }), true),
    [update],
  );
  const changeKnob = useCallback(
    (key: keyof Knobs, value: number | string) => {
      if (isKnobs({ [key]: value }))
        update((setting) => ({ ...setting, overrides: { ...setting.overrides, [key]: value } }));
    },
    [update],
  );
  const resetKnob = useCallback(
    (key?: keyof Knobs) =>
      update((setting) => {
        const overrides = { ...setting.overrides };
        if (key) delete overrides[key];
        return { ...setting, overrides: key ? overrides : {} };
      }),
    [update],
  );
  const changeKey = useCallback(
    (key: KeyChoice) => update((setting) => ({ ...setting, key }), true),
    [update],
  );
  return { flush, applyPreset, changeKnob, resetKnob, changeKey };
}
