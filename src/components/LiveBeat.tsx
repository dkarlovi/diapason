import type { CSSProperties } from "react";
import type { TransportState } from "../metronome";
import { useAudioClock } from "../hooks/useAudioClock";

export function LiveBeat({
  bpm,
  beatsPerBar,
  transport,
  clock,
}: {
  bpm: number;
  beatsPerBar: number;
  transport: TransportState | null;
  clock: Pick<AudioContext, "currentTime"> | null;
}) {
  const time = useAudioClock(clock, transport?.running ?? false);
  const elapsed = transport ? time - transport.downbeatTime : 0;
  const index = Math.floor((elapsed * bpm) / 60);
  const beat = transport ? ((index % beatsPerBar) + beatsPerBar) % beatsPerBar : -1;
  const seconds = Math.max(0, Math.floor(elapsed));
  return (
    <div
      className="live-beat"
      role="group"
      aria-label={`Metronome · ${bpm} BPM · ${beatsPerBar} beats/bar`}
    >
      <div
        className="beat-pips"
        aria-hidden="true"
        style={{ "--beat-columns": Math.min(6, beatsPerBar) } as CSSProperties}
      >
        {Array.from({ length: beatsPerBar }, (_, i) => (
          <span key={i} data-active={i === beat}>
            {i + 1}
          </span>
        ))}
      </div>
      <span className="beat-tempo">{bpm} BPM</span>
      {transport?.phase === "count-in" ? (
        <span className="beat-time">Count-in</span>
      ) : (
        transport?.phase === "recording" && (
          <span className="beat-time">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
          </span>
        )
      )}
    </div>
  );
}
