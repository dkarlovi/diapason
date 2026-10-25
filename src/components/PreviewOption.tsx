import { Play, Square } from "lucide-react";
import { Button } from "./primitives";

interface Props {
  label: string;
  selected: boolean;
  previewing: boolean;
  disabled: boolean;
  previewLabel: string;
  useLabel: string;
  onPreview(): void;
  onUse(): void;
  title?: string | undefined;
}
export function PreviewOption(props: Props) {
  return (
    <div
      className="editor-preset-option"
      data-selected={props.selected}
      data-previewing={props.previewing}
    >
      <span title={props.title}>
        {props.label}
        {props.selected ? " ✓" : ""}
      </span>
      <Button
        disabled={props.disabled}
        aria-label={props.previewLabel}
        aria-pressed={props.previewing}
        onClick={props.onPreview}
      >
        {props.previewing ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
        <span>Preview</span>
      </Button>
      <Button disabled={props.disabled} aria-label={props.useLabel} onClick={props.onUse}>
        Use
      </Button>
    </div>
  );
}
