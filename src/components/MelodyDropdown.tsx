import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  label: string;
  value: string;
  disabled: boolean;
  children(close: () => void): ReactNode;
}
export function MelodyDropdown({ label, value, disabled, children }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  const close = () => {
    setOpen(false);
    menu.current?.querySelector("summary")?.focus();
  };
  return (
    <div className="editor-preset-field">
      <span>{label}</span>
      <details
        ref={menu}
        open={open}
        className="editor-presets"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <summary
          aria-label={`Choose ${label.toLowerCase()}`}
          aria-disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            if (!disabled) setOpen(!open);
          }}
        >
          {value}
          <ChevronDown aria-hidden="true" />
        </summary>
        {open && <div className="editor-preset-menu">{children(close)}</div>}
      </details>
    </div>
  );
}
