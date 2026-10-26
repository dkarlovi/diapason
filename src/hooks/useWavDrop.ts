import { useEffect, useRef, useState } from "react";

type DropState = "idle" | "accept" | "reject";

const WAV_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]);

const carriesFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes("Files");

/** While dragging, browsers expose only each file's type, and Safari often leaves it
 *  empty. Refuse only when every file reports a type and none of them is WAV. */
function knownNotWav(event: DragEvent): boolean {
  const files = [...(event.dataTransfer?.items ?? [])].filter((item) => item.kind === "file");
  return files.length > 0 && files.every((item) => item.type && !WAV_TYPES.has(item.type));
}

/** At drop time names are known too, so a file counts as WAV by type or extension. */
const maybeWav = (file: File) => WAV_TYPES.has(file.type) || /\.wave?$/i.test(file.name);

const within = (event: DragEvent, selector: string) =>
  event.target instanceof Element && !!event.target.closest(selector);

/** While mounted, the page outside `exclude` accepts dropped WAV files; `state` drives the drop area. */
export function useWavDrop(onFiles: (files: File[]) => void, exclude: string) {
  const [state, setState] = useState<DropState>("idle");
  const latest = useRef(onFiles);
  latest.current = onFiles;
  useEffect(() => {
    // Entering a child fires dragleave on its parent, so count nesting depth.
    let depth = 0;
    const refused = (event: DragEvent) => within(event, exclude) || knownNotWav(event);
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth++;
      setState(within(event, exclude) ? "idle" : knownNotWav(event) ? "reject" : "accept");
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      // Cancelling dragover keeps the browser from opening a refused file itself.
      event.preventDefault();
      if (refused(event)) event.dataTransfer!.dropEffect = "none";
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setState("idle");
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setState("idle");
      const files = [...(event.dataTransfer?.files ?? [])];
      if (!files.length) return;
      event.preventDefault();
      if (!within(event, exclude) && files.some(maybeWav)) latest.current(files);
    };
    const listeners = { dragenter: enter, dragover: over, dragleave: leave, drop } as const;
    for (const [type, listener] of Object.entries(listeners))
      document.addEventListener(type, listener as EventListener);
    return () => {
      for (const [type, listener] of Object.entries(listeners))
        document.removeEventListener(type, listener as EventListener);
    };
  }, [exclude]);
  return state;
}
