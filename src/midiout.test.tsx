import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { connectMidi, selectedOutputId } from "./midiout";
import { MidiOutputPicker } from "./components/MidiOutputPicker";

it("renders MIDI port identifiers as option values without parsing markup", async () => {
  const id = '"><img src=x>';
  const port = { id, name: "External synth" } as MIDIOutput;
  const access = { outputs: new Map([[id, port]]), onstatechange: null } as unknown as MIDIAccess;
  vi.stubGlobal("navigator", { ...navigator, requestMIDIAccess: async () => access });
  expect(await connectMidi(true)).toBe(true);
  render(<MidiOutputPicker />);
  const select = screen.getByRole("combobox");
  expect((select.querySelectorAll("option")[1] as HTMLOptionElement).value).toBe(id);
  expect(select.querySelector("img")).toBeNull();
  fireEvent.change(select, { target: { value: id } });
  expect(selectedOutputId()).toBe(id);
  vi.unstubAllGlobals();
});
