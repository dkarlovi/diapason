import { afterEach, expect, it, vi } from "vitest";
import { playNotesMidi } from "./midi-playback";
import type { NoteEvent } from "./notes";
const note = (midi: number, start = 0.2, duration = 0.1): NoteEvent => ({
  midi,
  name: "test",
  start,
  duration,
});
afterEach(() => vi.restoreAllMocks());
it("schedules timestamped notes with lead-in, octave shift and early note-offs", () => {
  vi.spyOn(performance, "now").mockReturnValue(1000);
  const send = vi.fn();
  const out = { send } as unknown as MIDIOutput;
  playNotesMidi(out, [note(69), note(70, 0.3, 0.001), note(120), note(-20)], 1, 1);
  expect(send.mock.calls).toEqual([
    [[0x90, 81, 100], 1250],
    [[0x80, 81, 0], 1345],
    [[0x90, 82, 100], 1350],
    [[0x80, 82, 0], 1350.5],
  ]);
});
it("clamps position before playback and lasts through the longer of notes or requested duration", () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
  const out = { send: vi.fn() } as unknown as MIDIOutput;
  const playback = playNotesMidi(out, [note(69, 1, 1)], 0.5, 0);
  expect(playback.position()).toBe(0);
  clock.mockReturnValue(1550);
  expect(playback.position()).toBe(0.5);
  clock.mockReturnValue(3050);
  expect(playback.position()).toBe(2);
  clock.mockReturnValue(3051);
  expect(playback.position()).toBeNull();
  clock.mockReturnValue(4000);
  const padded = playNotesMidi(out, [], 3, 0);
  clock.mockReturnValue(6050);
  expect(padded.position()).toBe(2);
});
it.each([true, false])(
  "sends immediate cleanup messages with clear support %s",
  (supportsClear) => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const send = vi.fn(),
      clear = vi.fn();
    const out = { send, ...(supportsClear ? { clear } : {}) } as unknown as MIDIOutput;
    const playback = playNotesMidi(out, [note(69), note(69, 0.4)], 1, 0);
    send.mockClear();
    playback.stop();
    playback.stop();
    expect(send.mock.calls).toEqual([[[0x80, 69, 0]], [[0xb0, 123, 0]]]);
    expect(clear).toHaveBeenCalledTimes(supportsClear ? 1 : 0);
    expect(playback.position()).toBeNull();
  },
);
it("includes MIDI boundary keys and rounds pitches before octave shifting", () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  const send = vi.fn();
  playNotesMidi({ send } as unknown as MIDIOutput, [note(0), note(127), note(69.6)], 1, 0);
  expect(send.mock.calls.filter((_, i) => i % 2 === 0).map((args) => args[0])).toEqual([
    [0x90, 0, 100],
    [0x90, 127, 100],
    [0x90, 70, 100],
  ]);
});

it.each([true, false])(
  "retains the port's queued-message limitation when clear support is %s",
  (supportsClear) => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const queue: { message: number[]; at: number }[] = [];
    const out = {
      send(message: number[], at?: number) {
        if (at !== undefined) queue.push({ message, at });
      },
      ...(supportsClear
        ? {
            clear: () => {
              queue.length = 0;
            },
          }
        : {}),
    } as unknown as MIDIOutput;
    const playback = playNotesMidi(out, [note(69)], 1, 0);
    playback.stop();
    // Without a port clear() API, immediate note-offs cannot remove future note-ons.
    expect(queue.filter((event) => event.message[0] === 0x90)).toHaveLength(supportsClear ? 0 : 1);
  },
);

it("ends short notes before a following note instead of enforcing a 20ms overlap", () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  const send = vi.fn();
  playNotesMidi({ send } as unknown as MIDIOutput, [note(69, 0, 0.01), note(70, 0.01, 0.01)], 1, 0);
  expect(send.mock.calls[1]![1]).toBeLessThanOrEqual(send.mock.calls[2]![1]);
});
