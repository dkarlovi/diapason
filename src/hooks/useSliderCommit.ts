import { useEffect, useRef, type ComponentProps } from "react";
export interface EditGesture {
  active: boolean;
  begin(): void;
  update(value: number): void;
  commit(): void;
  cancel(): void;
}
const adjustmentKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);
export function useSliderCommit(
  gesture: EditGesture,
): Pick<
  ComponentProps<"input">,
  | "onPointerDown"
  | "onPointerUp"
  | "onPointerCancel"
  | "onLostPointerCapture"
  | "onKeyDown"
  | "onKeyUp"
  | "onBlur"
  | "onChange"
> {
  const mode = useRef<"pointer" | "keyboard" | null>(null);
  const blocked = useRef(false);
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    if (!gesture.active && mode.current) {
      mode.current = null;
      blocked.current = true;
    }
  }, [gesture.active]);
  const finish = (save: boolean) => {
    if (!mode.current) return;
    mode.current = null;
    if (save) gesture.commit();
    else {
      blocked.current = true;
      gesture.cancel();
    }
  };
  return {
    onPointerDown(event) {
      if (event.button > 0) return;
      if (pointer.current !== null && pointer.current !== event.pointerId) {
        finish(false);
        return;
      }
      if (event.isPrimary === false) return;
      finish(true);
      blocked.current = false;
      mode.current = "pointer";
      pointer.current = event.pointerId;
      gesture.begin();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerUp(event) {
      if (pointer.current !== event.pointerId) return;
      finish(true);
      pointer.current = null;
      blocked.current = false;
    },
    onPointerCancel(event) {
      if (pointer.current === event.pointerId) {
        finish(false);
        pointer.current = null;
      }
    },
    onLostPointerCapture(event) {
      if (pointer.current === event.pointerId) {
        finish(false);
        pointer.current = null;
      }
    },
    onKeyDown(event) {
      if (event.key === "Escape" && mode.current) {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
        return;
      }
      if (!adjustmentKeys.has(event.key) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (mode.current !== "keyboard") {
        finish(true);
        blocked.current = false;
        mode.current = "keyboard";
        gesture.begin();
      }
    },
    onKeyUp(event) {
      if (adjustmentKeys.has(event.key)) {
        finish(true);
        blocked.current = false;
      }
    },
    onBlur() {
      finish(true);
    },
    onChange(event) {
      if (blocked.current) return;
      const value = Number(event.currentTarget.value);
      if (mode.current) gesture.update(value);
      else {
        gesture.begin();
        gesture.update(value);
        gesture.commit();
      }
    },
  };
}
