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

const groups = {
  Essentials: ["steadiness", "keyPull", "contextCorrection", "gridPull"],
  Pitch: ["keyPull", "contextCorrection", "mode", "leapPenalty", "maxMoveSemitones"],
  Rhythm: ["grid", "gridPull", "swing", "syncopation", "articulation"],
  Detection: ["steadiness", "levelGate", "minNoteMs", "silenceGapMs"],
} satisfies Record<string, (keyof Knobs)[]>;
export function MelodyPanel(props: PropsWithChildren<MelodyPanelProps>) {
  const [group, setGroup] = useState<keyof typeof groups>("Essentials");
  const knobs = resolveKnobs(props.melody.preset, props.melody.overrides);
  return (
    <div className="melody-panel">
      {props.children}
      <section className="editor-tune-group editor-correction-group" aria-label="Melody correction">
        <h3>Melody correction</h3>
        <MelodyPresets {...props} />
        <MelodyKeyControls {...props} />
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
                disabled={props.disabled || props.knobAvailability?.(key).enabled === false}
                reason={props.knobAvailability?.(key).reason}
                onChange={props.changeKnob}
                gesture={{
                  active: props.drafting,
                  begin: () => props.beginKnob(key),
                  update: (value) => props.draftKnob(key, value),
                  commit: props.commitGesture,
                  cancel: props.cancelGesture,
                }}
                onReset={props.resetKnob}
                previewId={props.previewId}
                onPreview={(value) =>
                  props.previewMelody(
                    { overrides: { ...props.melody.overrides, [key]: value } },
                    `knob-${key}-${value}`,
                  )
                }
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
