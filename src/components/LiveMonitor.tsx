import type { RefObject } from "react";
import { liveReadout, type LiveLevel } from "../capture-presentation";
import type { TransportState } from "../metronome";
import { LiveBeat } from "./LiveBeat";

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
      {readout.clipping && <span className="clip-warning">Clipping</span>}
    </>
  );
}

function InputLevel({ readout, connected }: { readout: Readout; connected: boolean }) {
  const value = connected ? readout.db : "Microphone disconnected";
  return (
    <div className="live-level">
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
      <span className="level-db">{connected ? readout.db : "—"}</span>
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
}) {
  const readout = liveReadout(level);
  return (
    <section className="live-monitor" aria-label="Live signal" data-mode={mode}>
      <div className="live-chart">
        <canvas
          className="trace live-trace"
          ref={traceRef}
          role="img"
          aria-label={
            bpm === null ? "Live pitch trace" : "Live pitch trace with scrolling beat and bar lines"
          }
        >
          Live microphone pitch trace
        </canvas>
        <LivePitch readout={readout} connected={connected} />
        {connected && bpm !== null && (
          <>
            <span className="sr-only">
              {confirmed ? "Beat grid" : "Preview grid"} · {bpm} BPM · {beatsPerBar} beats/bar
            </span>
            <LiveBeat bpm={bpm} beatsPerBar={beatsPerBar} transport={transport} clock={clock} />
          </>
        )}
      </div>
      <InputLevel readout={readout} connected={connected} />
    </section>
  );
}
