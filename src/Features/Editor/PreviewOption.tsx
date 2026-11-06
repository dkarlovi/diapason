import { Check, Play, Square } from "lucide-react";
import { Button } from "../../UI/Button";
import { useId } from "react";

interface Props {
  label: string;
  selected: boolean;
  base?: boolean;
  previewing: boolean;
  disabled: boolean;
  previewLabel: string;
  useLabel: string;
  onPreview: () => void;
  onUse: () => void;
  title?: string | undefined;
}
const BASE_HINT = "Base preset: Use replaces your adjustments";
export function PreviewOption(props: Props) {
  const hintId = useId();
  const base = props.base && !props.selected;
  const action = props.previewing
    ? `Stop ${props.previewLabel.replace(/^(Play|Preview) /, "")}`
    : props.previewLabel;
  return (
    <div
      className="editor-preset-option"
      data-selected={props.selected}
      data-previewing={props.previewing}
    >
      <span className="preview-option-label" title={props.title}>
        {props.label}
        {base && (
          <span className="sr-only" id={hintId}>
            {BASE_HINT}
          </span>
        )}
      </span>
      <Button
        className="playback-control"
        disabled={props.disabled}
        aria-label={action}
        aria-pressed={props.previewing}
        onClick={props.onPreview}
      >
        {props.previewing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span className="preview-option-stack">
          <span data-active={!props.previewing}>Preview</span>
          <span data-active={props.previewing}>Stop</span>
        </span>
      </Button>
      <span className="preview-option-stack">
        <Button
          data-active={!props.selected}
          disabled={props.disabled || props.selected}
          aria-label={props.useLabel}
          aria-describedby={base ? hintId : undefined}
          title={base ? BASE_HINT : undefined}
          onClick={props.onUse}
        >
          Use
        </Button>
        <span
          className="preview-option-applied"
          data-active={props.selected}
          role="img"
          aria-label={`${props.useLabel.replace(/^Use /, "")} applied`}
        >
          <Check aria-hidden="true" />
        </span>
      </span>
    </div>
  );
}
