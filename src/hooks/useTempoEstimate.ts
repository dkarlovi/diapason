import { useCallback, useEffect, useRef, useState } from "react";
import { estimateTempo } from "../tempo-model";
export function useTempoEstimate(
  onEstimate: (bpm: number) => void,
  setMessage: (message: string) => void,
) {
  const latest = useRef(onEstimate);
  useEffect(() => {
    latest.current = onEstimate;
  }, [onEstimate]);
  const [estimate, setEstimate] = useState(() => estimateTempo([]));
  const [detected, setDetected] = useState(false);
  const events = useRef<number[]>([]);
  const addEvent = useCallback((t: number) => {
    if (events.current.length && t - events.current.at(-1)! > 2) events.current = [];
    events.current = [...events.current, t].slice(-9);
    const result = estimateTempo(events.current);
    setEstimate(result);
    setDetected(true);
    if (result.stable && result.bpm !== null) {
      latest.current(result.bpm);
      setMessage(`Estimated ${result.bpm} BPM — preview and confirm when ready.`);
    } else setMessage(`${result.eventCount} beats received — keep a steady beat.`);
  }, []);
  const resetEstimate = useCallback(() => {
    events.current = [];
    setEstimate(estimateTempo([]));
    setDetected(false);
  }, []);
  return { estimate, detected, addEvent, resetEstimate };
}
