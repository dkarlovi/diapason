import type { CSSProperties } from "react";
import { hasBeatSubdivision, type TransportState } from "../../Audio/Metronome";
import { useAudioClock } from "./useAudioClock";

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
  const position = (elapsed * bpm) / 60;
  const index = Math.floor(position);
  const beat = transport ? ((index % beatsPerBar) + beatsPerBar) % beatsPerBar : -1;
  // Leave a gap between the two flashes of a subdivided beat.
  const highlighted = !hasBeatSubdivision(bpm, beat) || (position - index) % 0.5 < 0.25;
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
          <span key={i} data-active={i === beat && highlighted}>
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
