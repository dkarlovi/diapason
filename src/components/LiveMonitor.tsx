import type { RefObject } from "react";
import { freqToMidi, midiToName } from "../notes";
import { Panel } from "./primitives";
export function LiveMonitor({
  level,
  traceRef,
  mode,
  bpm,
  beatsPerBar,
  confirmed,
  connected,
  gain,
  onGainChange,
  locked,
}: {
  level: { rms: number; peak: number; freq: number | null };
  traceRef: RefObject<HTMLCanvasElement | null>;
  mode: "listen" | "room" | "sound" | "clap" | "recording";
  bpm: number;
  beatsPerBar: number;
  confirmed: boolean;
  connected: boolean;
  gain: number;
  onGainChange(value: number): void;
  locked: boolean;
}) {
  const message = monitorMessage(connected, mode, level);
  return (
    <Panel title="Live sound">
      <div className="monitor-readout">
        <span>{message}</span>
        <span className="hint">
          {confirmed ? "Beat grid" : "Preview grid"} · {bpm} BPM · {beatsPerBar} beats/bar
        </span>
      </div>
      <label id="input-level-label">Input level</label>
      <div
        role="meter"
        aria-labelledby="input-level-label"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(Math.min(100, level.rms * 400))}
        className={`meter ${level.peak >= 0.98 ? "clip" : ""}`}
      >
        <div style={{ width: `${Math.min(100, level.rms * 400)}%` }} />
      </div>
      {connected && (
        <div className="field">
          <label htmlFor="cap-gain">Input gain — {gain.toFixed(1)}×</label>
          <input
            id="cap-gain"
            type="range"
            min="1"
            max="20"
            step="0.5"
            value={gain}
            disabled={locked}
            onChange={(event) => onGainChange(Number(event.target.value))}
          />
          <p className="hint">
            Changing gain requires measuring the room and checking your sound again.
          </p>
        </div>
      )}
      <canvas
        className="trace live-trace"
        ref={traceRef}
        role="img"
        aria-label="Live pitch trace with scrolling beat and bar lines"
      >
        {message}
      </canvas>
      <p className="hint">Bar lines mark the start of each bar; the bright line marks now.</p>
    </Panel>
  );
}

function monitorMessage(
  connected: boolean,
  mode: string,
  level: { rms: number; peak: number; freq: number | null },
): string {
  if (!connected) return "Connect your microphone to see live sound.";
  if (mode === "room") return "Measuring background noise — stay silent.";
  if (mode === "clap") return "Listening for claps — clap a steady beat.";
  if (level.peak >= 0.98) return "Signal is clipping — lower input gain.";
  if (level.freq !== null)
    return `Pitch detected: ${midiToName(Math.round(freqToMidi(level.freq)))}`;
  return level.rms > 0.003
    ? "Sound detected; no whistle pitch detected."
    : "Listening — whistle a steady note.";
}
