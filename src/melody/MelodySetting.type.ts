import type { KeyChoice } from "./interpret";
import type { PresetId, Knobs } from "./knobs";

export interface MelodySetting {
  preset: PresetId;
  overrides: Partial<Knobs>;
  key: KeyChoice;
}
