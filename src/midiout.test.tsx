import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("falls back when MIDI is unsupported or access is denied", async () => {
  vi.resetModules();
  const midi = await import("./midiout");
  vi.stubGlobal("navigator", {});
  expect(await midi.connectMidi(true)).toBe(false);
  expect(midi.activeOutput()).toBeNull();
  expect(midi.midiOutputs()).toEqual([]);
  vi.stubGlobal("navigator", {
    requestMIDIAccess: async () => {
      throw new Error("denied");
    },
  });
  expect(await midi.connectMidi(true)).toBe(false);
});
it("only silently requests access after permission is granted and reuses access", async () => {
  vi.resetModules();
  const midi = await import("./midiout");
  const access = { outputs: new Map(), onstatechange: null };
  const request = vi.fn(async () => access);
  const query = vi.fn().mockResolvedValue({ state: "prompt" });
  vi.stubGlobal("navigator", { requestMIDIAccess: request, permissions: { query } });
  expect(await midi.connectMidi(false)).toBe(false);
  expect(request).not.toHaveBeenCalled();
  query.mockResolvedValue({ state: "granted" });
  expect(await midi.connectMidi(false)).toBe(true);
  expect(await midi.connectMidi(true)).toBe(true);
  expect(request).toHaveBeenCalledOnce();
});
it("waits for an explicit request when permission cannot be queried", async () => {
  vi.resetModules();
  const midi = await import("./midiout");
  const request = vi.fn();
  vi.stubGlobal("navigator", {
    requestMIDIAccess: request,
    permissions: {
      query: async () => {
        throw new Error("unsupported");
      },
    },
  });
  expect(await midi.connectMidi(false)).toBe(false);
  expect(request).not.toHaveBeenCalled();
});
it("restores selected ports, notifies changes and falls back on disconnection", async () => {
  vi.resetModules();
  const midi = await import("./midiout");
  const port = { id: "saved", name: "Synth" } as MIDIOutput;
  const access = {
    outputs: new Map([[port.id, port]]),
    onstatechange: null as (() => void) | null,
  };
  vi.stubGlobal("navigator", { requestMIDIAccess: async () => access });
  localStorage.setItem("diapason.midiOutput", "saved");
  const notify = vi.fn();
  const off = midi.onOutputChange(notify);
  await midi.connectMidi(true);
  expect(midi.activeOutput()).toBe(port);
  midi.selectOutput("");
  expect(midi.activeOutput()).toBeNull();
  midi.selectOutput("saved");
  expect(midi.activeOutput()).toBe(port);
  access.outputs.delete(port.id);
  access.onstatechange?.();
  expect(midi.activeOutput()).toBeNull();
  expect(notify).toHaveBeenCalledTimes(4);
  off();
  midi.selectOutput("other");
  expect(notify).toHaveBeenCalledTimes(4);
});
it("keeps working when storage is unavailable", async () => {
  vi.resetModules();
  const midi = await import("./midiout");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("denied");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("denied");
  });
  expect(midi.selectedOutputId()).toBe("");
  expect(() => midi.selectOutput("port")).not.toThrow();
});
