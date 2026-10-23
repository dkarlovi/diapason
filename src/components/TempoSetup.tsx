import { useEffect } from "react";
import type { useTempo } from "../hooks/useTempo";
import { adjustTempo } from "../tempo-model";
import { Button, Field } from "./primitives";
export function TempoSetup({
  tempo,
  bpm,
  beatsPerBar,
}: {
  tempo: ReturnType<typeof useTempo>;
  bpm: number;
  beatsPerBar: number;
}) {
  const { tap } = tempo;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("button, input, select, textarea, a, [contenteditable]")
      )
        return;
      event.preventDefault();
      tap();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [tap]);
  return (
    <div>
      <p>Tap or clap a steady beat, or enter a tempo you already know.</p>
      <div className="row">
        <Button className="tap-tempo" onClick={tempo.tap}>
          Tap a beat <small>or press Space</small>
        </Button>
        <Button onClick={() => void tempo.startClap()} disabled={tempo.pending || tempo.listening}>
          Listen for claps
        </Button>
        {(tempo.listening || tempo.pending || tempo.transport) && (
          <Button onClick={tempo.stop}>Stop listening / preview</Button>
        )}
        <Button onClick={tempo.reset}>Start over</Button>
      </div>
      <p className="hint">
        {tempo.estimate.eventCount} beats received ·{" "}
        {tempo.estimate.stable ? "Steady estimate" : "Keep a steady beat for at least 5 beats"}
      </p>
      <div className="tempo-fields">
        <Field label="Tempo (BPM)" htmlFor="cap-bpm">
          <input
            id="cap-bpm"
            type="number"
            min="40"
            max="220"
            step="1"
            value={Number.isFinite(bpm) ? bpm : ""}
            onChange={(event) => tempo.changeBpm(event.target.valueAsNumber)}
          />
        </Field>
        <Field label="Beats per bar" htmlFor="cap-beats">
          <input
            id="cap-beats"
            type="number"
            min="1"
            max="12"
            step="1"
            value={Number.isFinite(beatsPerBar) ? beatsPerBar : ""}
            onChange={(event) => tempo.changeMeter(event.target.valueAsNumber)}
          />
        </Field>
      </div>
      <div className="row">
        <Button disabled={adjustTempo(bpm, 0.5) === null} onClick={() => tempo.adjust(0.5)}>
          Half tempo
        </Button>
        <Button disabled={adjustTempo(bpm, 2) === null} onClick={() => tempo.adjust(2)}>
          Double tempo
        </Button>
        <Button
          disabled={
            !Number.isInteger(bpm) ||
            bpm < 40 ||
            bpm > 220 ||
            !Number.isInteger(beatsPerBar) ||
            beatsPerBar < 1 ||
            beatsPerBar > 12 ||
            tempo.pending
          }
          onClick={() => void tempo.preview()}
        >
          Preview metronome
        </Button>
        <Button variant="primary" disabled={!tempo.canConfirm} onClick={tempo.confirm}>
          Confirm tempo
        </Button>
      </div>
      <p className="hint">Tapping and clapping find the pulse. Choose beats per bar separately.</p>
      <p role="status">{tempo.message}</p>
    </div>
  );
}
