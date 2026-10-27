import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { playNotesMidi } from "./midi-playback";
import type { NoteEvent } from "./notes";
import type { InstrumentId } from "./instruments";
const note = (midi: number, start = 0.2, duration = 0.1): NoteEvent => ({
  midi,
  name: "test",
  start,
  duration,
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("dispatches notes only when due, with octave shift and early note-offs", () => {
  const send = vi.fn();
  const playback = playNotesMidi(
    { send } as unknown as MIDIOutput,
    [note(70, 0.3, 0.001), note(69), note(120), note(-20)],
    1,
    1,
  );
  expect(send.mock.calls.filter(([bytes]) => bytes[0] === 0x90)).toEqual([]);
  vi.advanceTimersByTime(250);
  expect(send.mock.calls.at(-1)).toEqual([[0x90, 81, 100]]);
  vi.advanceTimersByTime(95);
  expect(send.mock.calls.at(-1)).toEqual([[0x80, 81, 0]]);
  vi.advanceTimersByTime(5);
  expect(send.mock.calls.at(-1)).toEqual([[0x90, 82, 100]]);
  vi.advanceTimersByTime(1);
  expect(send.mock.calls.at(-1)).toEqual([[0x80, 82, 0]]);
  expect(vi.getTimerCount()).toBe(0);
  playback.stop();
});

it.each([true, false])(
  "cancels future notes and silences held notes with clear support %s",
  (supportsClear) => {
    const send = vi.fn();
    const clear = vi.fn();
    const out = { send, ...(supportsClear ? { clear } : {}) } as unknown as MIDIOutput;
    const playback = playNotesMidi(out, [note(69, 0, 10), note(70, 5)], 10, 0);
    vi.advanceTimersByTime(100);
    expect(send.mock.calls.at(-1)).toEqual([[0x90, 69, 100]]);
    send.mockClear();
    playback.stop();
    playback.stop();
    expect(send.mock.calls).toEqual([[[0x80, 69, 0]], [[0xb0, 123, 0]], [[0xb0, 120, 0]]]);
    const cleanupCount = send.mock.calls.length;
    vi.advanceTimersByTime(20000);
    expect(send).toHaveBeenCalledTimes(cleanupCount);
    expect(vi.getTimerCount()).toBe(0);
    expect(playback.position()).toBeNull();
  },
);

it("can stop during the lead-in without sending a note-on", () => {
  const send = vi.fn();
  playNotesMidi({ send } as unknown as MIDIOutput, [note(69, 0)], 1, 0).stop();
  vi.advanceTimersByTime(1000);
  expect(send.mock.calls.filter(([bytes]) => bytes[0] === 0x90)).toEqual([]);
});

it.each<[InstrumentId, number]>([
  ["beep", 80],
  ["epiano", 4],
  ["pluck", 24],
  ["flute", 73],
  ["pad", 89],
])("selects the General MIDI program for %s before playing notes", async (instrument, program) => {
  vi.resetModules();
  const send = vi.fn();
  vi.doMock("./midiout", () => ({ activeOutput: () => ({ send }) }));
  const { playNotes } = await import("./playback");
  const playback = playNotes([note(69, 0)], 1, { instrument, octave: 1 });
  expect(send.mock.calls).toEqual([[[0xc0, program]]]);
  vi.advanceTimersByTime(50);
  expect(send.mock.calls.at(-1)).toEqual([[0x90, 81, 100]]);
  playback.stop();
  vi.doUnmock("./midiout");
});

it("clamps position before playback and lasts through the longer of notes or requested duration", () => {
  const out = { send: vi.fn() } as unknown as MIDIOutput;
  const playback = playNotesMidi(out, [note(69, 1, 1)], 0.5, 0);
  expect(playback.position()).toBe(0);
  vi.advanceTimersByTime(550);
  expect(playback.position()).toBe(0.5);
  vi.advanceTimersByTime(1500);
  expect(playback.position()).toBe(2);
  vi.advanceTimersByTime(1);
  expect(playback.position()).toBeNull();
  const padded = playNotesMidi(out, [], 3, 0);
  vi.advanceTimersByTime(2050);
  expect(padded.position()).toBe(2);
});

it("includes MIDI boundary keys and rounds pitches before octave shifting", () => {
  const send = vi.fn();
  playNotesMidi({ send } as unknown as MIDIOutput, [note(0), note(127), note(69.6)], 1, 0);
  vi.advanceTimersByTime(250);
  expect(send.mock.calls.filter(([bytes]) => bytes[0] === 0x90).map(([bytes]) => bytes)).toEqual([
    [0x90, 0, 100],
    [0x90, 127, 100],
    [0x90, 70, 100],
  ]);
});

it("ends short notes before the following note starts", () => {
  const send = vi.fn();
  playNotesMidi({ send } as unknown as MIDIOutput, [note(69, 0, 0.01), note(70, 0.01, 0.01)], 1, 0);
  vi.advanceTimersByTime(60);
  expect(send.mock.calls.slice(-3)).toEqual([
    [[0x90, 69, 100]],
    [[0x80, 69, 0]],
    [[0x90, 70, 100]],
  ]);
});

it("shifts source-edited pitches once without mutating saved or exported pitch", async () => {
  const { processRecording } = await import("./recording");
  const { recording } = await import("./test-support/recording");
  const rec = recording({
    noteEdits: { version: 1, pitch: [{ id: "manual", midi: 73, ranges: [{ start: 0, end: 1 }] }] },
  });
  const frames = Array.from({ length: 100 }, (_, i) => ({
    t: i * 0.01,
    freq: 440,
    rms: 0.1,
    clarity: 0.99,
  }));
  const notes = processRecording(rec, frames).notes;
  const send = vi.fn();
  playNotesMidi({ send } as unknown as MIDIOutput, notes, 1, 1);
  vi.advanceTimersByTime(50);
  expect(send.mock.calls[1]?.[0]).toEqual([0x90, 85, 100]);
  expect(notes[0]?.midi).toBe(73);
  expect(rec.noteEdits?.pitch[0]?.midi).toBe(73);
});

it("skips expired notes after a delayed timer instead of playing a burst", () => {
  const send = vi.fn();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  const playback = playNotesMidi(
    { send } as unknown as MIDIOutput,
    [note(69, 0, 0.1), note(70, 0.5, 1)],
    2,
    0,
  );
  clock.mockReturnValue(1000);
  vi.advanceTimersByTime(50);
  expect(send.mock.calls.filter(([bytes]) => bytes[0] === 0x90)).toEqual([[[0x90, 70, 100]]]);
  playback.stop();
  clock.mockRestore();
});
