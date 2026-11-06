import { afterEach, expect, it, vi } from "vitest";
import type { Playback } from "../Playback/Playback.type";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

it("plays the first notes when a MIDI output opens, including after a synth restart", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  const midi = await import("./MidiOutput");
  const { playNotes } = await import("../Playback/Playback");
  const access = {
    outputs: new Map<string, MIDIOutput>(),
    onstatechange: null as (() => void) | null,
  };
  const send = vi.fn((_bytes: number[]) => {
    if (port.connection === "open") return;
    port.connection = "open";
    queueMicrotask(() => access.onstatechange?.());
  });
  const port = { id: "fluidsynth", connection: "closed", send };
  access.outputs.set(port.id, port as unknown as MIDIOutput);
  vi.stubGlobal("navigator", { requestMIDIAccess: async () => access });
  await midi.connectMidi(true);
  midi.selectOutput(port.id);
  let playback: Playback | null = null;
  const unsubscribe = midi.onOutputChange(() => playback?.stop());
  const notes = [{ midi: 69, name: "A4", start: 0, duration: 1 }];

  playback = playNotes(notes, 1);
  await vi.advanceTimersByTimeAsync(50);
  expect(send.mock.calls).toContainEqual([[0x90, 69, 100]]);
  expect(playback.position()).toBe(0);

  access.outputs.delete(port.id);
  access.onstatechange?.();
  expect(playback.position()).toBeNull();
  expect(midi.activeOutput()).toBeNull();
  port.connection = "closed";
  access.outputs.set(port.id, port as unknown as MIDIOutput);
  access.onstatechange?.();
  expect(midi.activeOutput()?.id).toBe(port.id);
  send.mockClear();

  playback = playNotes(notes, 1);
  await vi.advanceTimersByTimeAsync(50);
  expect(send.mock.calls).toContainEqual([[0x90, 69, 100]]);
  expect(playback.position()).toBe(0);

  midi.selectOutput("");
  expect(playback.position()).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  unsubscribe();
});
