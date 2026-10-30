import { Play, Square } from "lucide-react";
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
  onPreview(): void;
  onUse(): void;
  title?: string | undefined;
}
export function PreviewOption(props: Props) {
  const stateId = useId();
  const state = [
    props.selected ? "Applied" : props.base ? "Base preset — Use replaces adjustments" : "",
    props.previewing ? "Previewing" : "",
  ]
    .filter(Boolean)
    .join(" · ");
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
        {state && (
          <small className="preview-option-state" id={stateId}>
            {state}
          </small>
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
        <span>{props.previewing ? "Stop" : "Preview"}</span>
      </Button>
      <Button
        disabled={props.disabled}
        aria-label={props.useLabel}
        aria-describedby={state ? stateId : undefined}
        onClick={props.onUse}
      >
        Use
      </Button>
    </div>
  );
}
