import type { ComponentProps } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className = "",
  align = "end",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <div className="studio-shell editor-shell editor-popover-theme">
        <PopoverPrimitive.Content
          className={`editor-popover ${className}`}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={12}
          {...props}
        />
      </div>
    </PopoverPrimitive.Portal>
  );
}
