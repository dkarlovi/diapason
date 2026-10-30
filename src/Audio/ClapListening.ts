import type { MicHandle } from "./Audio";
import { createClapDetector } from "./ClapDetector";
export async function openClapListener(
  mic: MicHandle,
  floor: number,
  onEvent: (time: number) => void,
  onInterrupted: (message: string) => void,
  isCurrent: () => boolean,
): Promise<() => void> {
  const detector = createClapDetector(mic.sampleRate, floor);
  const interrupted = () => {
    if (document.hidden || mic.context.state !== "running")
      onInterrupted("Listening paused — start again when ready.");
  };
  const off = await mic.subscribePcm((samples, start) => {
    if (!isCurrent()) return;
    interrupted();
    if (mic.context.state !== "running" || document.hidden) return;
    detector.process(samples, start).forEach(onEvent);
  });
  const timer = window.setTimeout(
    () => onInterrupted("Listening finished — review the estimate or try again."),
    15000,
  );
  document.addEventListener("visibilitychange", interrupted);
  mic.context.addEventListener?.("statechange", interrupted);
  return () => {
    off();
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", interrupted);
    mic.context.removeEventListener?.("statechange", interrupted);
  };
}
