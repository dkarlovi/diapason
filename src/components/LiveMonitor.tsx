import type { RefObject } from "react";
import { liveReadout, type LiveLevel } from "../capture-presentation";
import type { TransportState } from "../metronome";
import { LiveBeat } from "./LiveBeat";
import { PitchCanvas } from "./PitchCanvas";
import type { PitchRange } from "../pitch";
import { rangeLabel } from "../voice-range";

type Readout = ReturnType<typeof liveReadout>;
function LivePitch({ readout, connected }: { readout: Readout; connected: boolean }) {
  if (!connected)
    return <p className="live-chart-placeholder">Connect your microphone to see live sound</p>;
  return (
    <>
      <div className="live-pitch" title={readout.message}>
        <strong>{readout.note ?? "—"}</strong>
        <span>{readout.frequency}</span>
      </div>
      <span className="sr-only">{readout.message}</span>
    </>
  );
}

function InputLevel({ readout, connected }: { readout: Readout; connected: boolean }) {
  const value = connected ? readout.db : "Microphone disconnected";
  return (
    <div className="live-level" data-clipping={readout.clipping}>
      <label id="input-level-label">Input level</label>
      <div
        role="meter"
        aria-labelledby="input-level-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={readout.percent}
        aria-valuetext={readout.clipping ? "Clipping" : value}
        className={"meter" + (readout.clipping ? " clip" : "")}
      >
        <div style={{ width: readout.percent + "%" }} />
      </div>
      <span className={"level-db" + (readout.clipping ? " clip-warning" : "")}>
        {readout.clipping ? "Clipping" : connected ? readout.db : "—"}
      </span>
      <span
        className={"clip-light" + (readout.clipping ? " active" : "")}
        title={readout.clipping ? "Clipping" : "No clipping"}
        aria-hidden="true"
      />
    </div>
  );
}

export function LiveMonitor({
  level,
  traceRef,
  mode,
  bpm,
  beatsPerBar,
  confirmed,
  connected,
  transport = null,
  clock = null,
  preferredRange,
}: {
  level: LiveLevel;
  traceRef: RefObject<HTMLCanvasElement | null>;
  mode: "listen" | "room" | "sound" | "clap" | "recording";
  bpm: number | null;
  beatsPerBar: number;
  confirmed: boolean;
  connected: boolean;
  transport?: TransportState | null;
  clock?: Pick<AudioContext, "currentTime"> | null;
  preferredRange?: PitchRange | undefined;
}) {
  const readout = liveReadout(level);
  return (
    <section className="live-monitor" aria-label="Live signal" data-mode={mode}>
      <div className="live-chart">
        <PitchCanvas
          className="live-trace"
          ref={traceRef}
          aria-label={
            bpm === null ? "Live pitch trace" : "Live pitch trace with scrolling beat and bar lines"
          }
        >
          Live microphone pitch trace
        </PitchCanvas>
        <LivePitch readout={readout} connected={connected} />
        {preferredRange && (
          <span className="sr-only">
            Calibrated range: {rangeLabel(preferredRange)}, including margin. The shaded band guides
            detection; notes outside it can still be recorded.
          </span>
        )}
        {connected && bpm !== null && (
          <>
            <span className="sr-only">
              {confirmed ? "Beat grid" : "Preview grid"} · {bpm} BPM · {beatsPerBar} beats/bar
            </span>
            <LiveBeat bpm={bpm} beatsPerBar={beatsPerBar} transport={transport} clock={clock} />
          </>
        )}
        <InputLevel readout={readout} connected={connected} />
      </div>
    </section>
  );
}
