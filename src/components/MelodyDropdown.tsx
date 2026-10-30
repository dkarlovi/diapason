import { useContext, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "../UI/Primitives";
import { Popover, PopoverContent, PopoverTrigger } from "../UI/Popover";
import { ResetControl } from "./ResetControl";
import { AuditionMenuContext } from "./AuditionMenuContext";

interface Props {
  label: string;
  value: string;
  disabled: boolean;
  tooltip?: string | undefined;
  onReset(): void;
  children(close: () => void): ReactNode;
}
export function MelodyDropdown({ label, value, disabled, tooltip, onReset, children }: Props) {
  const [localOpen, setLocalOpen] = useState(false);
  const context = useContext(AuditionMenuContext);
  const open = context ? context.visible && context.menu === label : localOpen;
  const setOpen = (next: boolean) =>
    context ? context.setMenu(next ? label : null) : setLocalOpen(next);
  return (
    <div className="editor-preset-field" title={tooltip}>
      <span className="editor-field-label">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            className="editor-select-trigger"
            aria-label={`Choose ${label.toLowerCase()}`}
            disabled={disabled}
            aria-description={tooltip}
          >
            {value}
            <ChevronDown aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="editor-preset-menu"
          aria-label={`${label} options`}
          onCloseAutoFocus={(event) => {
            if (context && !context.visible) event.preventDefault();
          }}
        >
          {children(() => setOpen(false))}
        </PopoverContent>
      </Popover>
      <ResetControl label={label} disabled={disabled} onReset={onReset} />
    </div>
  );
}
