import { useEffect, useState } from "react";

/** Read the same clock the audible metronome uses, rather than a UI timer's phase. */
export function useAudioClock(clock: Pick<AudioContext, "currentTime"> | null, running: boolean) {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!clock || !running) return;
    const tick = () => setTime(clock.currentTime);
    tick();
    const timer = window.setInterval(tick, 25);
    return () => window.clearInterval(timer);
  }, [clock, running]);
  return running ? time : 0;
}
