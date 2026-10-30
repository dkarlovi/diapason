import type { Interpretation, KeyChoice } from "../../Melody/Interpret";
import type { Knobs, PresetId } from "../../Melody/Knobs";
import type { MelodySetting } from "../../Melody/MelodySetting.type";

export interface MelodyPanelProps {
  melody: MelodySetting;
  interpretation: Interpretation | null;
  disabled: boolean;
  knobAvailability?: (key: keyof Knobs) => { enabled: boolean; reason?: string };
  fixedNotes?: boolean;
  previewId: string | null;
  applyPreset: (id: PresetId) => void;
  drafting: boolean;
  beginKnob(key: keyof Knobs): void;
  draftKnob(key: keyof Knobs, value: number): void;
  commitGesture(): void;
  cancelGesture(): void;
  changeKnob: (key: keyof Knobs, value: number | string) => void;
  resetKnob: (key?: keyof Knobs) => void;
  changeKey: (key: KeyChoice) => void;
  previewMelody: (change: Partial<MelodySetting>, id: string) => void;
}
