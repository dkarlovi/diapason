import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./primitives";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface Props {
  label: string;
  value: string;
  disabled: boolean;
  onReset(): void;
  children(close: () => void): ReactNode;
}
export function MelodyDropdown({ label, value, disabled, onReset, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="editor-preset-field">
      <button
        type="button"
        className="editor-reset-label"
        disabled={disabled}
        title={`Reset ${label.toLowerCase()} to default`}
        onClick={onReset}
      >
        {label}
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className="editor-select-trigger"
            aria-label={`Choose ${label.toLowerCase()}`}
            disabled={disabled}
          >
            {value}
            <ChevronDown aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="editor-preset-menu" aria-label={`${label} options`}>
          {children(() => setOpen(false))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
