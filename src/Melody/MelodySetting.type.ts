import type { KeyChoice } from "./Interpret";
import type { PresetId, Knobs } from "./Knobs";

export interface MelodySetting {
  preset: PresetId;
  overrides: Partial<Knobs>;
  key: KeyChoice;
}
