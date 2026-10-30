import { useMidiOutput } from "./useMidiOutput";

export function MidiOutputPicker() {
  const output = useMidiOutput();
  if (!output.supported) return null;
  return (
    <label className="spacer midi-output">
      <span className="midi-output-label">MIDI out</span>
      <select
        value={output.selected}
        onChange={(event) => void output.change(event.target.value)}
        style={{ width: "auto" }}
        title="Where MIDI playback goes. Remembered on this machine."
      >
        <option value="">Browser synth</option>
        {output.ports.map((port) => (
          <option key={port.id} value={port.id}>
            MIDI: {port.name ?? port.id}
          </option>
        ))}
        {!output.ports.length && <option value={output.connectValue}>MIDI device…</option>}
      </select>
    </label>
  );
}
