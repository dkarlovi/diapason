import { INSTRUMENTS } from "../instruments";
import { useEditor } from "../hooks/useEditor";
import { SLIDERS, sliderLabel, sliderValue, type SliderDef } from "../editor-model";
import type { Tuning } from "../tuning";
import { Breadcrumb, Button, Field } from "./primitives";

function Slider({
  item,
  tuning,
  onChange,
  onReset,
}: {
  item: SliderDef;
  tuning: Tuning;
  onChange: (key: keyof Tuning, value: number) => void;
  onReset: (key: keyof Tuning) => void;
}) {
  const value = sliderValue(item.key, tuning);
  return (
    <div className="ctl">
      <label
        htmlFor={item.id}
        title={`${item.tip}\nDouble-click to reset.`}
        onDoubleClick={(event) => {
          event.preventDefault();
          onReset(item.key);
        }}
      >
        {item.label}
      </label>
      <input
        id={item.id}
        type="range"
        min={item.min}
        max={item.max}
        step={item.step}
        value={value}
        onChange={(event) => onChange(item.key, Number(event.target.value))}
      />
      <span className="val">{sliderLabel(item.key, value)}</span>
    </div>
  );
}

export function Editor({ id }: { id: string }) {
  const state = useEditor(id);
  const playhead =
    state.position === null || !state.record
      ? null
      : `${Math.min(100, (state.position / state.record.durationSec) * 100)}%`;
  return (
    <div id="view-editor">
      <Breadcrumb current="Take" />
      <div className="pair">
        <section className="side">
          <div className="side-head">
            <h2>Take</h2>
            <span className="hint">{state.meta}</span>
          </div>
          <div className="grid-wrap">
            <canvas className="trace roll" ref={state.traceRef} />
            <div
              className="playhead"
              hidden={playhead === null}
              style={{ left: playhead ?? undefined }}
            />
          </div>
          <div className="row actions">
            <Button
              className="play"
              disabled={!state.record}
              onClick={() => state.togglePlayback("audio")}
            >
              {state.playing === "audio" ? "■ Stop" : "▶ Play audio"}
            </Button>
            <Button
              className="export"
              disabled={!state.record}
              onClick={state.downloadWav}
              title="The raw recorded audio."
            >
              ⬇ .wav
            </Button>
            <Button disabled={!state.record} onClick={state.downloadJson} title="Diagnostics data.">
              ⬇ .json
            </Button>
            <Button disabled={!state.record} onClick={() => void state.copyLog()}>
              Copy log
            </Button>
            <span className="hint">{state.copyStatus}</span>
          </div>
          <div style={{ marginTop: "1.1rem" }}>
            <Field label="Name" htmlFor="ed-name">
              <input
                id="ed-name"
                type="text"
                value={state.draftName}
                onChange={(event) => state.setDraftName(event.target.value)}
                onBlur={state.commitName}
                disabled={!state.record}
              />
            </Field>
          </div>
          <div className="row">
            <Button disabled={!state.record} onClick={() => void state.duplicate()}>
              Duplicate
            </Button>
            <Button
              disabled={!state.record}
              variant="danger"
              className="spacer"
              onClick={() => void state.remove()}
            >
              Delete take
            </Button>
          </div>
          <textarea
            id="ed-log-out"
            ref={state.logRef}
            value={state.reportText}
            readOnly
            spellCheck={false}
            hidden={!state.reportText}
          />
        </section>
        <section className="side">
          <div className="side-head">
            <h2>MIDI</h2>
            <span className="hint">{state.notesLabel}</span>
          </div>
          <div className="grid-wrap">
            <canvas
              className="trace roll"
              ref={state.rollRef}
              onClick={state.clickRoll}
              onMouseMove={state.moveRoll}
              style={{ cursor: state.rollHover ? "pointer" : undefined }}
              title="Click a note to hear it, Ctrl+click to mute or unmute it."
            />
            <div
              className="playhead"
              hidden={playhead === null}
              style={{ left: playhead ?? undefined }}
            />
          </div>
          <div className="row actions">
            <Button
              className="play"
              disabled={!state.record}
              onClick={() => state.togglePlayback("midi")}
            >
              {state.playing === "midi" ? "■ Stop" : "▶ Play MIDI"}
            </Button>
            <Button
              variant="primary"
              className="export"
              disabled={!state.record}
              onClick={state.downloadMidi}
              title="Import into a DAW on an instrument track."
            >
              ⬇ .mid
            </Button>
            <select
              className="spacer"
              value={state.play.instrument}
              disabled={!state.record || state.externalOutput}
              onChange={(event) =>
                state.changePlay({
                  ...state.play,
                  instrument: event.target.value as typeof state.play.instrument,
                })
              }
              title={
                state.externalOutput
                  ? "Playing through a MIDI device — it picks the sound."
                  : "Instrument for playback (the .mid has no instrument)."
              }
            >
              {INSTRUMENTS.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.label}
                </option>
              ))}
            </select>
            <select
              value={state.play.octave}
              disabled={!state.record}
              onChange={(event) =>
                state.changePlay({ ...state.play, octave: Number(event.target.value) })
              }
              title="Shift playback by octaves (doesn't affect the .mid)."
            >
              <option value="1">+1 oct</option>
              <option value="0">±0 oct</option>
              <option value="-1">−1 oct</option>
              <option value="-2">−2 oct</option>
              <option value="-3">−3 oct</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: "1.1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: ".4rem", margin: 0 }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={state.quantize.on}
                disabled={!state.record}
                onChange={(event) =>
                  state.changeQuantize(event.target.checked, state.quantize.subdivision)
                }
              />{" "}
              Quantize to
            </label>
            <div style={{ width: 140 }}>
              <select
                value={state.quantize.subdivision}
                disabled={!state.record || !state.quantize.on}
                onChange={(event) =>
                  state.changeQuantize(state.quantize.on, Number(event.target.value))
                }
              >
                <option value="1">1/4 notes</option>
                <option value="2">1/8 notes</option>
                <option value="4">1/16 notes</option>
                <option value="3">1/8 triplets</option>
              </select>
            </div>
          </div>
          <div className="tune" style={{ marginTop: "1rem" }}>
            {SLIDERS.slice(0, 2).map((item) => (
              <Slider
                key={item.id}
                item={item}
                tuning={state.tuning}
                onChange={state.changeTuning}
                onReset={state.resetTuning}
              />
            ))}
          </div>
          <details className="more">
            <summary>More</summary>
            <div className="tune">
              {SLIDERS.slice(2).map((item) => (
                <Slider
                  key={item.id}
                  item={item}
                  tuning={state.tuning}
                  onChange={state.changeTuning}
                  onReset={state.resetTuning}
                />
              ))}
            </div>
            <div className="row" style={{ marginTop: ".8rem" }}>
              <Button disabled={!state.record} onClick={() => state.resetTuning()}>
                Reset all
              </Button>
            </div>
          </details>
          <p className="hint">
            Click a note on the grid to hear it, Ctrl+click to mute it. Tuning is saved with this
            take; hover a label for what it does, double-click it to reset.
          </p>
        </section>
      </div>
    </div>
  );
}
