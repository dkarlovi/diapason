import { INSTRUMENTS } from "../instruments";
import { useEditor } from "../hooks/useEditor";
import { Breadcrumb, Button, Field } from "./primitives";

const sliders = [
  {
    id: "t-sticky",
    label: "Stickiness",
    min: "0",
    max: "1",
    step: "0.05",
    value: "0.4",
    tip: "How far pitch can drift before a new note starts.",
  },
  {
    id: "t-minlen",
    label: "Min note length",
    min: "20",
    max: "300",
    step: "10",
    value: "80",
    tip: "Notes shorter than this are dropped.",
  },
  {
    id: "t-silence",
    label: "Silence gap",
    min: "30",
    max: "300",
    step: "10",
    value: "90",
    tip: "A quiet gap this long ends the current note.",
  },
  {
    id: "t-debounce",
    label: "Change debounce",
    min: "0",
    max: "200",
    step: "10",
    value: "60",
    tip: "A new pitch must hold this long before it splits the note.",
  },
  {
    id: "t-smooth",
    label: "Smoothing",
    min: "1",
    max: "11",
    step: "2",
    value: "5",
    tip: "Median filter width in frames.",
  },
  {
    id: "t-clarity",
    label: "Clarity gate",
    min: "0.85",
    max: "0.999",
    step: "0.005",
    value: "0.9",
    tip: "Minimum detection confidence per frame.",
  },
  {
    id: "t-gate",
    label: "Level gate",
    min: "0.001",
    max: "0.1",
    step: "0.001",
    value: "0.003",
    tip: "Frames quieter than this are silence.",
  },
];

function Slider({ item }: { item: (typeof sliders)[number] }) {
  return (
    <div className="ctl">
      <label htmlFor={item.id} title={`${item.tip}\nDouble-click to reset.`}>
        {item.label}
      </label>
      <input
        id={item.id}
        type="range"
        min={item.min}
        max={item.max}
        step={item.step}
        defaultValue={item.value}
      />
      <span className="val" id={`${item.id}-v`} />
    </div>
  );
}

export function Editor({ id }: { id: string }) {
  useEditor(id);
  return (
    <div id="view-editor">
      <Breadcrumb current="Take" />
      <div className="pair">
        <section className="side">
          <div className="side-head">
            <h2>Take</h2>
            <span className="hint" id="ed-meta" />
          </div>
          <div className="grid-wrap">
            <canvas className="trace roll" id="ed-trace" />
            <div className="playhead" hidden />
          </div>
          <div className="row actions">
            <Button id="ed-play-audio" className="play">
              ▶ Play audio
            </Button>
            <Button id="ed-dl-wav" className="export" title="The raw recorded audio.">
              ⬇ .wav
            </Button>
            <Button id="ed-dl-json" title="Diagnostics data.">
              ⬇ .json
            </Button>
            <Button id="ed-copy-log">Copy log</Button>
            <span className="hint" id="ed-copy-status" />
          </div>
          <div style={{ marginTop: "1.1rem" }}>
            <Field label="Name" htmlFor="ed-name">
              <input id="ed-name" type="text" />
            </Field>
          </div>
          <div className="row">
            <Button id="ed-duplicate">Duplicate</Button>
            <Button id="ed-delete" variant="danger" className="spacer">
              Delete take
            </Button>
          </div>
          <textarea id="ed-log-out" readOnly spellCheck={false} hidden />
        </section>
        <section className="side">
          <div className="side-head">
            <h2>MIDI</h2>
            <span className="hint" id="ed-notes" />
          </div>
          <div className="grid-wrap">
            <canvas
              className="trace roll"
              id="ed-roll"
              title="Click a note to hear it, Ctrl+click to mute or unmute it."
            />
            <div className="playhead" hidden />
          </div>
          <div className="row actions">
            <Button id="ed-play-midi" className="play">
              ▶ Play MIDI
            </Button>
            <Button
              id="ed-dl-midi"
              variant="primary"
              className="export"
              title="Import into a DAW on an instrument track."
            >
              ⬇ .mid
            </Button>
            <select
              id="ed-instrument"
              className="spacer"
              title="Instrument for playback (the .mid has no instrument)."
            >
              {INSTRUMENTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
            <select id="ed-octave" title="Shift playback by octaves (doesn't affect the .mid).">
              <option value="1">+1 oct</option>
              <option value="0">±0 oct</option>
              <option value="-1">−1 oct</option>
              <option value="-2">−2 oct</option>
              <option value="-3">−3 oct</option>
            </select>
          </div>
          <div className="row" style={{ marginTop: "1.1rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: ".4rem", margin: 0 }}>
              <input type="checkbox" id="ed-quant-on" style={{ width: "auto" }} defaultChecked />{" "}
              Quantize to
            </label>
            <div style={{ width: 140 }}>
              <select id="ed-subdiv" defaultValue="2">
                <option value="1">1/4 notes</option>
                <option value="2">1/8 notes</option>
                <option value="4">1/16 notes</option>
                <option value="3">1/8 triplets</option>
              </select>
            </div>
          </div>
          <div className="tune" style={{ marginTop: "1rem" }}>
            {sliders.slice(0, 2).map((item) => (
              <Slider key={item.id} item={item} />
            ))}
          </div>
          <details className="more">
            <summary>More</summary>
            <div className="tune">
              {sliders.slice(2).map((item) => (
                <Slider key={item.id} item={item} />
              ))}
            </div>
            <div className="row" style={{ marginTop: ".8rem" }}>
              <Button id="ed-reset-tuning">Reset all</Button>
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
