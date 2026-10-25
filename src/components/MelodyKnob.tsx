import { useId } from "react";
import type { KnobDef, Knobs } from "../melody/knobs";
import { knobValueLabel } from "../editor-model";
import type { MelodyPanelProps } from "./MelodyPanel";
export function MelodyKnob({
  def,
  value,
  disabled,
  onChange,
  onReset,
}: {
  def: KnobDef;
  value: Knobs[keyof Knobs];
  disabled: boolean;
  onChange: MelodyPanelProps["changeKnob"];
  onReset: MelodyPanelProps["resetKnob"];
}) {
  const id = useId();
  const text =
    def.kind === "range" && def.max <= 1 && def.key !== "levelGate"
      ? `${Math.round(Number(value) * 100)}%`
      : knobValueLabel(def, value);
  return (
    <div className="ctl">
      <label
        htmlFor={id}
        title={`${def.tip} Double-click to reset.`}
        onDoubleClick={() => onReset(def.key)}
      >
        {def.label}
      </label>
      {def.kind === "range" ? (
        <input
          id={id}
          type="range"
          title={def.tip}
          min={def.min}
          max={def.max}
          step={def.step}
          value={value}
          aria-valuetext={text}
          disabled={disabled}
          onChange={(event) => onChange(def.key, Number(event.target.value))}
        />
      ) : (
        <select
          id={id}
          title={def.tip}
          value={value}
          disabled={disabled}
          onChange={(event) =>
            onChange(def.key, def.key === "grid" ? Number(event.target.value) : event.target.value)
          }
        >
          {def.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      <span className="val">{text}</span>
    </div>
  );
}
