import { useState, type PropsWithChildren } from "react";
import { KNOB_DEFS, resolveKnobs, type Knobs, type PresetId } from "../melody/knobs";
import type { Interpretation, KeyChoice } from "../melody/interpret";
import type { MelodySetting } from "../melody/settings";
import { MelodyKnob } from "./MelodyKnob";
import { MelodyKeyControls } from "./MelodyKeyControls";
import { MelodyPresets } from "./MelodyPresets";
export interface MelodyPanelProps {
  melody: MelodySetting;
  interpretation: Interpretation | null;
  disabled: boolean;
  previewId: string | null;
  applyPreset: (id: PresetId) => void;
  changeKnob: (key: keyof Knobs, value: number | string) => void;
  resetKnob: (key?: keyof Knobs) => void;
  changeKey: (key: KeyChoice) => void;
  previewMelody: (change: Partial<MelodySetting>, id: string) => void;
}

const groups = {
  Essentials: ["steadiness", "keyPull", "gridPull"],
  Pitch: ["keyPull", "mode", "leapPenalty", "maxMoveSemitones"],
  Rhythm: ["grid", "gridPull", "swing", "syncopation", "articulation"],
  Detection: ["steadiness", "levelGate", "minNoteMs", "silenceGapMs"],
} satisfies Record<string, (keyof Knobs)[]>;
export function MelodyPanel(props: PropsWithChildren<MelodyPanelProps>) {
  const [group, setGroup] = useState<keyof typeof groups>("Essentials");
  const knobs = resolveKnobs(props.melody.preset, props.melody.overrides);
  return (
    <section className="melody-panel" aria-label="Melody correction">
      <MelodyPresets {...props} />
      <MelodyKeyControls {...props} />
      {props.children}
      <nav className="melody-categories" aria-label="Tuning category">
        {Object.keys(groups).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={group === name}
            onClick={() => setGroup(name as keyof typeof groups)}
          >
            {name}
          </button>
        ))}
      </nav>
      <div className="melody-controls">
        {groups[group].map((key) => {
          const def = KNOB_DEFS.find((def) => def.key === key)!;
          return (
            <MelodyKnob
              key={key}
              def={def}
              value={knobs[key]}
              disabled={props.disabled}
              onChange={props.changeKnob}
              onReset={props.resetKnob}
            />
          );
        })}
      </div>
    </section>
  );
}
