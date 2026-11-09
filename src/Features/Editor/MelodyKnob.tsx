import { useSliderCommit, type EditGesture } from "./useSliderCommit";
import { useId } from "react";
import { snapGlide } from "../../Melody/PitchCurve";
import { MelodyDropdown } from "./MelodyDropdown";
import { PreviewOption } from "./PreviewOption";
import type { KnobDef, Knobs } from "../../Melody/Knobs";
import { knobValueLabel } from "../../Editing/Editor.model";
import { ResetControl } from "./ResetControl";
import type { MelodyPanelProps } from "./MelodyPanel.type";

export function MelodyKnob({
  def,
  value,
  disabled,
  reason,
  onChange,
  onReset,
  onPreview,
  previewId,
  gesture,
}: {
  def: KnobDef;
  value: Knobs[keyof Knobs];
  disabled: boolean;
  reason?: string | undefined;
  onChange: MelodyPanelProps["changeKnob"];
  onReset: MelodyPanelProps["resetKnob"];
  onPreview: (value: number | string) => void;
  previewId: string | null;
  gesture: EditGesture;
}) {
  const id = useId();
  const slider = useSliderCommit({
    ...gesture,
    update(next) {
      gesture.update(def.key === "glide" ? snapGlide(next) : next);
    },
  });
  const text =
    def.kind === "range" && def.max <= 1 && def.key !== "levelGate"
      ? `${Math.round(Number(value) * 100)}%`
      : knobValueLabel(def, value);
  if (def.kind === "select")
    return (
      <MelodyDropdown
        label={def.label}
        value={text}
        disabled={disabled}
        onReset={() => onReset(def.key)}
      >
        {(close) =>
          def.options.map((option) => (
            <PreviewOption
              key={option.value}
              label={option.label}
              selected={value === option.value}
              previewing={previewId === `knob-${def.key}-${option.value}`}
              disabled={disabled}
              previewLabel={`Preview ${def.label} ${option.label}`}
              applyLabel={`Use ${def.label} ${option.label}`}
              onPreview={() => onPreview(option.value)}
              onUse={() => {
                onChange(def.key, option.value);
                close();
              }}
            />
          ))
        }
      </MelodyDropdown>
    );
  return (
    <div className="ctl" title={reason ?? def.tip}>
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="editor-field-label"
        title={reason ?? def.tip}
      >
        {def.label}
      </label>

      <input
        id={id}
        aria-labelledby={`${id}-label`}
        type="range"
        title={reason ?? def.tip}
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        aria-describedby={reason ? `${id}-reason` : undefined}
        aria-valuetext={knobValueLabel(def, value)}
        disabled={disabled}
        {...slider}
        onKeyDown={(event) => {
          slider.onKeyDown?.(event);
          if (def.key !== "glide" || event.ctrlKey || event.metaKey || event.altKey) return;
          const next = glideKeyValue(Number(value), event.key);
          if (next === null) return;
          event.preventDefault();
          gesture.update(next);
        }}
      />
      {reason && (
        <span id={`${id}-reason`} className="sr-only">
          {reason}
        </span>
      )}
      <span className="val">{text}</span>
      <ResetControl label={def.label} disabled={disabled} onReset={() => onReset(def.key)} />
    </div>
  );
}

function glideKeyValue(value: number, key: string): number | null {
  if (key === "Home") return 0;
  if (key === "End") return 1;
  const direction = new Map([
    ["ArrowRight", 1],
    ["ArrowUp", 1],
    ["PageUp", 1],
    ["ArrowLeft", -1],
    ["ArrowDown", -1],
    ["PageDown", -1],
  ]).get(key);
  if (!direction) return null;
  const detent = glideDetent(value, direction);
  if (detent !== null) return detent;
  const amount = key.startsWith("Page") ? 0.1 : 0.01;
  return snapGlide(Math.round((value + direction * amount) * 100) / 100);
}

function glideDetent(value: number, direction: number): number | null {
  if (value < 0.4 && direction > 0) return value === 0 ? 0.2 : 0.4;
  if (value <= 0.4 && direction < 0) return value <= 0.2 ? 0 : 0.2;
  return null;
}
