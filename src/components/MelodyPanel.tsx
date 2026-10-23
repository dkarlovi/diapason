import { useId } from "react";
import { Button, Field } from "./primitives";
import {
  KNOB_DEFS,
  PRESETS,
  resolveKnobs,
  type KnobDef,
  type Knobs,
  type PresetId,
} from "../melody/knobs";
import { keyName, type Key } from "../melody/key";
import type { Interpretation, KeyChoice } from "../melody/interpret";
import type { MelodySetting } from "../melody/settings";
import { knobValueLabel } from "../editor-model";
interface Props {
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
const keys: Key[] = Array.from({ length: 12 }, (_, tonic) => [
  { tonic, mode: "major" as const },
  { tonic, mode: "minor" as const },
]).flat();
const keyValue = (key: Key) => `${key.tonic}-${key.mode}`;
function KnobControl({
  def,
  value,
  disabled,
  onChange,
  onReset,
}: {
  def: KnobDef;
  value: Knobs[keyof Knobs];
  disabled: boolean;
  onChange: Props["changeKnob"];
  onReset: Props["resetKnob"];
}) {
  const id = useId();
  const text = knobValueLabel(def, value);
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
function PresetRow({
  kind,
  ...props
}: Pick<Props, "melody" | "disabled" | "previewId" | "previewMelody" | "applyPreset"> & {
  kind: "intent" | "mood";
}) {
  return (
    <div className="preset-grid">
      {Object.values(PRESETS)
        .filter((preset) => preset.kind === kind)
        .map((preset) => (
          <article
            key={preset.id}
            className="preset-card"
            data-selected={props.melody.preset === preset.id}
          >
            <strong>{preset.label}</strong>
            <p className="hint">{preset.blurb}</p>
            <div className="row">
              <Button
                disabled={props.disabled}
                aria-label={`Play ${preset.label}`}
                aria-pressed={props.previewId === `preset-${preset.id}`}
                onClick={() =>
                  props.previewMelody({ preset: preset.id, overrides: {} }, `preset-${preset.id}`)
                }
              >
                {props.previewId === `preset-${preset.id}` ? "Stop" : "Play"}
              </Button>
              <Button
                disabled={props.disabled}
                aria-label={`Use ${preset.label}`}
                aria-pressed={props.melody.preset === preset.id}
                onClick={() => props.applyPreset(preset.id)}
              >
                Use
              </Button>
            </div>
          </article>
        ))}
    </div>
  );
}
function KeyControls(
  props: Pick<
    Props,
    "melody" | "interpretation" | "disabled" | "previewId" | "changeKey" | "previewMelody"
  >,
) {
  const id = useId();
  const chosen = props.interpretation?.key.chosen;
  const offered = [
    ...new Map(
      [
        ...(props.interpretation?.key.ranked.slice(0, 3).map((item) => item.key) ?? []),
        ...(props.melody.key === "auto" ? [] : [props.melody.key]),
      ].map((key) => [keyValue(key), key]),
    ).values(),
  ];
  return (
    <div className="melody-key">
      <Field htmlFor={id} label="Key">
        <select
          id={id}
          value={props.melody.key === "auto" ? "auto" : keyValue(props.melody.key)}
          disabled={props.disabled}
          onChange={(event) =>
            props.changeKey(
              event.target.value === "auto"
                ? "auto"
                : keys.find((key) => keyValue(key) === event.target.value)!,
            )
          }
        >
          <option value="auto">Auto{chosen ? ` · ${keyName(chosen)}` : ""}</option>
          {offered.map((key) => (
            <option key={keyValue(key)} value={keyValue(key)}>
              {keyName(key)}
            </option>
          ))}
        </select>
      </Field>
      <div className="row key-alternatives" aria-label="Suggested keys">
        {props.interpretation?.key.ranked.slice(0, 3).map(({ key }) => (
          <div key={keyValue(key)}>
            <small>{keyName(key)}</small>{" "}
            <Button
              disabled={props.disabled}
              aria-label={`Play key ${keyName(key)}`}
              aria-pressed={props.previewId === `key-${keyValue(key)}`}
              onClick={() => props.previewMelody({ key }, `key-${keyValue(key)}`)}
            >
              {props.previewId === `key-${keyValue(key)}` ? "Stop" : "Play"}
            </Button>{" "}
            <Button
              disabled={props.disabled}
              aria-label={`Use key ${keyName(key)}`}
              onClick={() => props.changeKey(key)}
            >
              Use
            </Button>
          </div>
        ))}
      </div>
      <details>
        <summary>I know my key</summary>
        <Field label="Choose any key" htmlFor={`${id}-all`}>
          <select
            id={`${id}-all`}
            value={
              props.melody.key === "auto"
                ? keyValue(chosen ?? keys[0]!)
                : keyValue(props.melody.key)
            }
            disabled={props.disabled}
            onChange={(event) =>
              props.changeKey(keys.find((key) => keyValue(key) === event.target.value)!)
            }
          >
            {keys.map((key) => (
              <option key={keyValue(key)} value={keyValue(key)}>
                {keyName(key)}
              </option>
            ))}
          </select>
        </Field>
        <Button disabled={props.disabled} onClick={() => props.changeKey("auto")}>
          Use Auto
        </Button>
      </details>
    </div>
  );
}
export function MelodyPanel(props: Props) {
  const knobs = resolveKnobs(props.melody.preset, props.melody.overrides);
  const label = PRESETS[props.melody.preset].label;
  const controls = (basic: boolean) =>
    KNOB_DEFS.filter((def) => def.basic === basic).map((def) => (
      <KnobControl
        key={def.key}
        def={def}
        value={knobs[def.key]}
        disabled={props.disabled}
        onChange={props.changeKnob}
        onReset={props.resetKnob}
      />
    ));
  return (
    <section className="melody-panel" aria-label="Melody correction">
      <h3>{Object.keys(props.melody.overrides).length ? `Custom (from ${label})` : label}</h3>
      <p className="hint">Play a version to compare it, then use it as your starting point.</p>
      <h4>Intent</h4>
      <PresetRow {...props} kind="intent" />
      <h4>Mood</h4>
      <PresetRow {...props} kind="mood" />
      <KeyControls {...props} />
      <div className="tune">{controls(true)}</div>
      <details className="more">
        <summary>More</summary>
        {["listening", "key", "shape", "rhythm"].map((family) => (
          <fieldset key={family}>
            <legend>
              {
                {
                  listening: "Listening",
                  key: "Key and harmony",
                  shape: "Melody shape",
                  rhythm: "Rhythm and feel",
                }[family as "listening"]
              }
            </legend>
            <div className="tune">
              {KNOB_DEFS.filter((def) => !def.basic && def.family === family).map((def) => (
                <KnobControl
                  key={def.key}
                  def={def}
                  value={knobs[def.key]}
                  disabled={props.disabled}
                  onChange={props.changeKnob}
                  onReset={props.resetKnob}
                />
              ))}
            </div>
          </fieldset>
        ))}
      </details>
      <Button disabled={props.disabled} onClick={() => props.resetKnob()}>
        Reset all
      </Button>
    </section>
  );
}
