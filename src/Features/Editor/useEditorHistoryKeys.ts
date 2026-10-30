import { useEffect, useRef } from "react";
interface Options {
  enabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo(): void;
  redo(): void;
}
export function useEditorHistoryKeys(options: Options): void {
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const state = latest.current;
      if (
        !state.enabled ||
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey)
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"])',
        )
      )
        return;
      const key = event.key.toLowerCase();
      const redo =
        (key === "z" && event.shiftKey) || (key === "y" && event.ctrlKey && !event.metaKey);
      const undo = key === "z" && !event.shiftKey;
      if (redo && state.canRedo) {
        event.preventDefault();
        state.redo();
      } else if (undo && state.canUndo) {
        event.preventDefault();
        state.undo();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
}
