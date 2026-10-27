import { useCallback, type RefObject } from "react";
import { type Recording } from "../db";
import { melodySettingFor, sameMelodySetting, type MelodySetting } from "../melody/settings";
import { isKnobs, type Knobs, type PresetId } from "../melody/knobs";
import type { KeyChoice } from "../melody/interpret";
export function useMelodySettings(
  recordRef: RefObject<Recording | null>,
  change: (label: string, transform: (record: Recording) => Recording) => void,
) {
  const update = useCallback(
    (transform: (setting: MelodySetting) => MelodySetting, label = "Change tuning") => {
      if (recordRef.current)
        change(label, (current) => {
          const before = melodySettingFor(current);
          const melody = transform(before);
          return sameMelodySetting(before, melody) ? current : { ...current, melody };
        });
    },
    [recordRef, change],
  );
  const applyPreset = useCallback(
    (preset: PresetId) =>
      update((setting) => ({ ...setting, preset, overrides: {} }), "Apply preset"),
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
      update(
        (setting) => {
          const overrides = { ...setting.overrides };
          if (key) delete overrides[key];
          return { ...setting, overrides: key ? overrides : {} };
        },
        key ? `Reset ${key}` : "Reset tuning controls",
      ),
    [update],
  );
  const changeKey = useCallback(
    (key: KeyChoice) => update((setting) => ({ ...setting, key }), "Change key"),
    [update],
  );
  return { applyPreset, changeKnob, resetKnob, changeKey };
}
