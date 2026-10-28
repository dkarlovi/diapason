import { useSliderCommit, type EditGesture } from "../hooks/useSliderCommit";
import { useId } from "react";
import { MelodyDropdown } from "./MelodyDropdown";
import { PreviewOption } from "./PreviewOption";
import type { KnobDef, Knobs } from "../melody/knobs";
import { knobValueLabel } from "../editor-model";
import type { MelodyPanelProps } from "./MelodyPanel";
import { ResetControl } from "./ResetControl";
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
  onPreview(value: number | string): void;
  previewId: string | null;
  gesture: EditGesture;
}) {
  const id = useId();
  const slider = useSliderCommit(gesture);
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
              useLabel={`Use ${def.label} ${option.label}`}
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
        aria-valuetext={text}
        disabled={disabled}
        {...slider}
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
