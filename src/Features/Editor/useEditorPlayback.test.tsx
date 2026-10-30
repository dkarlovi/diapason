import { CompressionStream, DecompressionStream } from "node:stream/web";
import "fake-indexeddb/auto";
import { flushEditorSaves } from "../../Editing/EditorSaveQueue";
import { resetEditorStorageDouble } from "../../../tests/support/editor-storage-double";
import { wavChunks } from "../../Encoding/WavReader";
import { webcrypto } from "node:crypto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Frame } from "../../Melody/Notes";
import type { Recording } from "../../Recording/Recording.type";
import { useEditor } from "./useEditor";

const state = vi.hoisted(() => ({
  saves: [] as Recording[],
  downloads: [] as { blob: Blob; name: string }[],
  handles: [] as { position: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[],
  notes: [] as unknown[][],
  output: null as (() => void) | null,
  external: false,
  frames: null as Frame[] | null,
  midiError: false,
  events: [] as string[],
  duration: 1,
}));
vi.mock("../../Midi/Midi", async (original) => {
  const midi = await original<typeof import("../../Midi/Midi")>();
  const guard =
    <T extends unknown[], R>(fn: (...args: T) => R) =>
    (...args: T): R => {
      if (state.midiError) throw new Error("MIDI resolution cannot preserve distinct notes.");
      return fn(...args);
    };
  return { ...midi, midiEvents: guard(midi.midiEvents), notesToMidi: guard(midi.notesToMidi) };
});
vi.mock("../../Editing/Edit.storage", async (original) => ({
  ...(await original<typeof import("../../Editing/Edit.storage")>()),
  ...(await import("../../../tests/support/editor-storage-double")).editorStorageDouble,
}));
vi.mock("../../Recording/Recording.storage", () => ({
  getRecording: async (id: string): Promise<Recording> => ({
    id,
    name: id,
    createdAt: 1,
    sampleRate: 48000,
    durationSec: state.duration,
    bpm: 120,
    beatsPerBar: 4,
    audio: new Blob(),
    capture: { gain: 1, peak: 0.2, noiseFloor: 0.003, dspOff: true },
    tuning: {},
  }),
  putRecording: async (record: Recording) => {
    state.saves.push(record);
  },
  deleteRecording: async () => {},
}));
vi.mock("../../Audio/Codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("../../Audio/Recorder", async (original) => ({
  ...(await original<typeof import("../../Audio/Recorder")>()),
  analyzeBuffer: () =>
    state.frames ??
    Array.from({ length: 12 }, (_, i) => ({ t: i * 0.05, freq: 440, clarity: 0.99, rms: 0.1 })),
}));
vi.mock("../../Playback/Playback", () => {
  const handle = () => {
    const h = {
      position: vi.fn((): number | null => 0.25),
      stop: vi.fn(() => {
        state.events.push("stop");
      }),
    };
    state.handles.push(h);
    return h;
  };
  return {
    playPcm: handle,
    playNotes: (...args: unknown[]) => {
      state.events.push("start");
      state.notes.push(args);
      return handle();
    },
  };
});
vi.mock("../../Midi/MidiOutput", () => ({
  activeOutput: () => (state.external ? {} : null),
  onOutputChange: (cb: () => void) => {
    state.output = cb;
    return () => {
      state.output = null;
    };
  },
}));
vi.mock("../../UI/Download", async (original) => ({
  ...(await original<typeof import("../../UI/Download")>()),
  downloadBlob: (blob: Blob, name: string) => state.downloads.push({ blob, name }),
}));
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}
let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("CompressionStream", CompressionStream);
  vi.stubGlobal("DecompressionStream", DecompressionStream);
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value() {
      return read(this);
    },
  });
  state.saves = [];
  state.downloads = [];
  state.handles = [];
  state.notes = [];
  state.external = false;
  state.frames = null;
  state.midiError = false;
  state.events = [];
  state.duration = 1;
  callbacks = new Map();
  nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});
afterEach(async () => {
  cleanup();
  await flushEditorSaves();
  resetEditorStorageDouble();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function editor() {
  const hook = renderHook(({ id }) => useEditor(id), { wrapper, initialProps: { id: "one" } });
  await waitFor(() => expect(hook.result.current.analysisReady).toBe(true));
  return hook;
}
function tick() {
  const pending = [...callbacks.values()];
  callbacks.clear();
  act(() => pending.forEach((cb) => cb(1)));
}
it("toggles audio, switches to MIDI and stops when playback finishes", async () => {
  const { result } = await editor();
  await act(async () => result.current.togglePlayback("audio"));
  expect(result.current.playing).toBe("audio");
  expect(result.current.notice?.message).toBe("Playing original audio");
  tick();
  expect(result.current.playhead.getState().position).toBe(0.25);
  await act(async () => result.current.togglePlayback("audio"));
  expect(result.current.playing).toBeNull();
  expect(result.current.notice).toBeNull();
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
  await act(async () => result.current.togglePlayback("audio"));
  await act(async () => result.current.togglePlayback("midi"));
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
  expect(result.current.playing).toBe("midi");
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69, start: 0, duration: 0.5 }]);
  state.handles.at(-1)!.position.mockReturnValue(null);
  tick();
  expect(result.current.playing).toBeNull();
  expect(result.current.playhead.getState().position).toBeNull();
});
it("advances the playhead without re-rendering the editor", async () => {
  let renders = 0;
  const hook = renderHook(
    ({ id }) => {
      renders++;
      return useEditor(id);
    },
    { wrapper, initialProps: { id: "one" } },
  );
  await waitFor(() => expect(hook.result.current.analysisReady).toBe(true));
  await act(async () => hook.result.current.togglePlayback("midi"));
  const before = renders;
  const handle = state.handles.at(-1)!;
  for (const value of [0.1, 0.2, 0.3, 0.4]) {
    handle.position.mockReturnValue(value);
    tick();
    expect(hook.result.current.playhead.getState().position).toBe(value);
  }
  expect(renders).toBe(before);
});
it("stops on output changes, recording changes and unmount and unsubscribes", async () => {
  const hook = await editor();
  await act(async () => hook.result.current.togglePlayback("midi"));
  state.external = true;
  await act(async () => state.output?.());
  expect(hook.result.current.externalOutput).toBe(true);
  expect(hook.result.current.playing).toBeNull();
  await act(async () => hook.result.current.togglePlayback("audio"));
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
  await act(async () => hook.result.current.togglePlayback("audio"));
  hook.unmount();
  expect(state.handles[2]?.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
  expect(state.output).toBeNull();
});
it("flushes tuning to the old recording before loading another recording", async () => {
  const hook = await editor();
  vi.useFakeTimers();
  await act(async () => hook.result.current.changeKnob("minNoteMs", 120));
  hook.rerender({ id: "two" });
  expect(state.saves).toMatchObject([{ id: "one", melody: { overrides: { minNoteMs: 120 } } }]);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => vi.advanceTimersByTime(500));
  expect(hook.result.current.record?.id).toBe("two");
  expect(state.saves).toHaveLength(1);
});
function read(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
}
it("exports playable MIDI and a single WAV containing the current tune", async () => {
  const { result } = await editor();
  await act(async () => {
    await result.current.downloadMidi();
    await result.current.downloadWav();
  });
  expect(state.downloads.map((d) => d.name.split(".").at(-1))).toEqual(["mid", "wav"]);
  const bytes = await read(state.downloads[1]!.blob);
  const chunk = wavChunks(bytes).find((c) => c.id === "dpsn")!;
  const data = JSON.parse(
    new TextDecoder().decode(new Uint8Array(bytes, chunk.start, chunk.length)),
  );
  expect(data.schemaVersion).toBe(2);
  expect(data.tune.name).toBe("one");
  expect(data.audio.sampleCount).toBe(48000);
});
it("reports MIDI encoding failures instead of throwing from export handlers", async () => {
  const { result } = await editor();
  state.midiError = true;
  await act(async () => result.current.downloadMidi());
  expect(state.downloads).toEqual([]);
  expect(result.current.notice?.message).toContain("MIDI export failed");
});
it("requires applying or stopping an unapplied audition before downloading", async () => {
  const { result } = await editor();
  await act(async () =>
    result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(result.current.canExport).toBe(false);
  await act(async () => {
    await result.current.downloadMidi();
    await result.current.downloadWav();
  });
  expect(state.downloads).toEqual([]);
});

it("replaces note previews and stops the preview on unmount", async () => {
  const hook = await editor();
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  const event = {
    currentTarget: canvas,
    clientX: 25,
    clientY: 67,
    ctrlKey: false,
    metaKey: false,
  } as Parameters<typeof hook.result.current.clickRoll>[0];
  await act(async () => hook.result.current.clickRoll(event));
  await act(async () => hook.result.current.clickRoll(event));
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69, start: 0 }]);
  expect(hook.result.current.selectedNote?.name).toBe("A4");
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  hook.unmount();
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
});
it("ignores an obsolete playback animation callback after starting a new recording", async () => {
  const hook = await editor();
  await act(async () => hook.result.current.togglePlayback("audio"));
  const oldTick = [...callbacks.values()][0]!;
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  await act(async () => hook.result.current.togglePlayback("midi"));
  await act(async () => oldTick(1));
  expect(state.handles[1]?.position).not.toHaveBeenCalled();
  expect(callbacks.size).toBe(1);
});

function midiEvents(bytes: Uint8Array) {
  let offset = 22,
    tick = 0;
  const events: { tick: number; status: number; key: number; velocity: number }[] = [];
  const variable = () => {
    let value = 0,
      byte: number;
    do {
      byte = bytes[offset++]!;
      value = (value << 7) | (byte & 0x7f);
    } while (byte & 0x80);
    return value;
  };
  while (offset < bytes.length) {
    tick += variable();
    const status = bytes[offset++]!;
    if (status === 0xff) {
      offset++;
      const length = variable();
      offset += length;
      continue;
    }
    if ((status & 0xf0) === 0xc0) {
      offset++;
      continue;
    }
    events.push({ tick, status, key: bytes[offset++]!, velocity: bytes[offset++]! });
  }
  return events;
}
it("exports only enabled notes and applies the selected grid to MIDI event timing", async () => {
  state.duration = 1.1; // The final synthetic frame extends to 1.03 seconds.
  const tone = (t: number, freq: number): Frame => ({ t, freq, clarity: 0.99, rms: 0.1 });
  state.frames = [
    ...Array.from({ length: 6 }, (_, i) => tone(0.07 + i * 0.05, 440)),
    { ...tone(0.42, 440), freq: null },
    { ...tone(0.52, 440), freq: null },
    ...Array.from({ length: 8 }, (_, i) => tone(0.63 + i * 0.05, 523.2511306011972)),
  ];
  const { result } = await editor();
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  await act(async () =>
    result.current.clickRoll({
      currentTarget: canvas,
      clientX: 10,
      clientY: 71,
      ctrlKey: true,
      metaKey: false,
    } as Parameters<typeof result.current.clickRoll>[0]),
  );
  expect(result.current.notesLabel).toContain("1 notes · 1 muted");
  await act(async () => result.current.changeKnob("grid", 2));
  await act(async () => result.current.downloadMidi());
  expect(midiEvents(new Uint8Array(await read(state.downloads[0]!.blob)))).toEqual([
    { tick: 720, status: 0x90, key: 72, velocity: 96 },
    { tick: 960, status: 0x80, key: 72, velocity: 0 },
  ]);
  await act(async () => result.current.changeKnob("grid", 0));
  await act(async () => result.current.downloadMidi());
  expect(midiEvents(new Uint8Array(await read(state.downloads[1]!.blob)))).toEqual([
    { tick: 605, status: 0x90, key: 72, velocity: 96 },
    { tick: 989, status: 0x80, key: 72, velocity: 0 },
  ]);
});

it("embeds the latest applied state and hashes only PCM bytes", async () => {
  const { result } = await editor();
  await act(async () => result.current.changeKnob("grid", 0));
  await act(async () => result.current.downloadWav());
  const bytes = await read(state.downloads[0]!.blob);
  const chunks = wavChunks(bytes);
  const meta = chunks.find((c) => c.id === "dpsn")!;
  const data = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, meta.start, meta.length)));
  expect(data.intent.intent.melody.overrides.grid).toBe(0);
  const pcm = chunks.find((c) => c.id === "data")!;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice(pcm.start, pcm.start + pcm.length),
  );
  expect(data.audio.sha256).toBe(
    Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join(""),
  );
});
it("does not download an obsolete WAV after navigating during hashing", async () => {
  const hook = await editor();
  let release!: (bytes: ArrayBuffer) => void;
  const pendingDigest = new Promise<ArrayBuffer>((resolve) => {
    release = resolve;
  });
  const digest = vi.spyOn(crypto.subtle, "digest").mockReturnValueOnce(pendingDigest);
  let exporting!: Promise<void>;
  await act(async () => {
    exporting = hook.result.current.downloadWav();
  });
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  await act(async () => {
    release(new ArrayBuffer(32));
    await exporting;
  });
  expect(state.downloads).toHaveLength(0);
  digest.mockRestore();
});

it("previews presets without saving and stops on repeat, replacement and unmount", async () => {
  const hook = await editor();
  const before = JSON.stringify(hook.result.current.record);
  await act(async () =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69 }]);
  expect(state.saves).toEqual([]);
  expect(JSON.stringify(hook.result.current.record)).toBe(before);
  expect(hook.result.current.previewId).toBe("preset-gentle");
  await act(async () =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  expect(hook.result.current.previewId).toBeNull();
  await act(async () =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  await act(async () =>
    hook.result.current.previewMelody({ preset: "clean", overrides: {} }, "preset-clean"),
  );
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
  hook.unmount();
  expect(state.handles[2]?.stop).toHaveBeenCalledOnce();
});
it("applying a preset clears custom controls and saves the chosen preset", async () => {
  const { result } = await editor();
  await act(async () => result.current.changeKnob("keyPull", 0.2));
  await act(async () => result.current.applyPreset("gentle"));
  expect(state.saves.at(-1)?.melody).toEqual({ preset: "gentle", key: "auto", overrides: {} });
});

it("identifies applied recipes separately from unapplied and playback-setting auditions", async () => {
  const { result } = await editor();
  await act(async () => result.current.applyPreset("gentle"));
  await act(async () =>
    result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(result.current.previewApplied).toBe(true);
  await act(async () => result.current.stopPlayback());
  await act(async () => result.current.changeKnob("steadiness", 0.9));
  await act(async () =>
    result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(result.current.previewApplied).toBe(false);
  await act(async () =>
    result.current.previewPlay(
      { instrument: "flute", octave: 0 },
      "play-instrument-flute",
      "Instrument: Flute",
    ),
  );
  expect(result.current.previewLabel).toBe("Instrument: Flute");
  expect(result.current.canExport).toBe(false);
  await act(async () => {
    await result.current.downloadMidi();
    await result.current.downloadWav();
  });
  expect(state.downloads).toEqual([]);
  expect(result.current.previewApplied).toBe(false);
  expect(result.current.play.instrument).toBe("beep");
  await act(async () => result.current.stopPlayback());
  expect(result.current.previewLabel).toBeNull();
});

it("undoes note edits then tuning while preserving a later name", async () => {
  const { result } = await editor();
  await act(async () => result.current.changeKnob("steadiness", 0.9));
  await act(async () => result.current.applyPreset("clean"));
  await act(async () => result.current.setDraftName("Keep this name"));
  await act(async () => result.current.commitName());
  await act(async () => result.current.selectNote(result.current.items[0]!));
  await act(async () => result.current.shiftSelectedPitch(1));
  await act(async () => result.current.undo());
  expect(result.current.record?.noteEdits).toBeUndefined();
  expect(result.current.melody.preset).toBe("clean");
  await act(async () => result.current.undo());
  expect(result.current.melody.overrides.steadiness).toBe(0.9);
  expect(result.current.record?.name).toBe("Keep this name");
  await act(async () => result.current.redo());
  expect(result.current.melody.preset).toBe("clean");
});

it("recognizes the currently selected effective grid when its default is not an override", async () => {
  const { result } = await editor();
  await act(async () => result.current.applyPreset("clean"));
  expect(result.current.melody.overrides.grid).toBeUndefined();
  await act(async () => result.current.previewMelody({ overrides: { grid: 2 } }, "knob-grid-2"));
  expect(result.current.previewApplied).toBe(true);
});

it("does not carry tuning undo into another recording", async () => {
  const hook = await editor();
  await act(async () => hook.result.current.applyPreset("gentle"));
  expect(hook.result.current.canUndo).toBe(true);
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  expect(hook.result.current.canUndo).toBe(false);
});

it("stops a note preview before scheduling a new sequence", async () => {
  const hook = await editor();
  await act(async () => hook.result.current.selectNote(hook.result.current.items[0]!));
  await act(async () =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(state.events).toEqual(["start", "stop", "start"]);
});
it("clears the pressed preview state when changing recordings", async () => {
  const hook = await editor();
  await act(async () =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  expect(hook.result.current.previewId).toBeNull();
});
it("shows context playback at the selected phrase's recording position", async () => {
  state.duration = 3;
  const tone = (t: number, midi: number): Frame => ({
    t,
    freq: 440 * 2 ** ((midi - 69) / 12),
    clarity: 0.99,
    rms: 0.1,
  });
  state.frames = [
    ...Array.from({ length: 6 }, (_, i) => tone(0.1 + i * 0.05, 69)),
    { ...tone(0.5, 69), freq: null },
    { ...tone(0.8, 69), freq: null },
    ...Array.from({ length: 6 }, (_, i) => tone(1 + i * 0.05, 72)),
    { ...tone(1.5, 72), freq: null },
    { ...tone(1.8, 72), freq: null },
    ...Array.from({ length: 6 }, (_, i) => tone(2 + i * 0.05, 76)),
  ];
  const hook = await editor();
  await act(async () => hook.result.current.selectNote(hook.result.current.items[2]!));
  await act(async () => hook.result.current.previewContext());
  tick();
  expect(hook.result.current.playhead.getState().position).toBeCloseTo(1.25);
});

it("draws the exact auditioned notes and restores applied notes through regular Stop", async () => {
  const hook = await editor();
  const applied = hook.result.current.displayNotes;
  await act(async () =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(hook.result.current.displayNotes).toEqual(state.notes.at(-1)?.[0]);
  expect(hook.result.current.previewLabel).toBe("Gentle fix");
  expect(hook.result.current.notesLabel).toContain("Gentle fix · performed timing");
  expect(state.saves).toHaveLength(0);
  await act(async () => hook.result.current.togglePlayback("midi"));
  expect(hook.result.current.playing).toBeNull();
  expect(hook.result.current.displayNotes).toEqual(applied);
  expect(hook.result.current.previewLabel).toBeNull();
});

it("does not create history when resetting a legacy take already at defaults", async () => {
  const { result } = await editor();
  await act(async () => result.current.resetKnob());
  expect(result.current.canUndo).toBe(false);
  expect(result.current.record?.melody).toBeUndefined();
});
it("clears a selection when committed tuning removes its note", async () => {
  state.frames = Array.from({ length: 12 }, (_, i) => ({
    t: i * 0.05,
    freq: 440,
    clarity: 0.99,
    rms: 0.01,
  }));
  const { result } = await editor();
  await act(async () => result.current.changeKnob("levelGate", 0.001));
  await act(async () => result.current.selectNote(result.current.items[0]!));
  expect(result.current.selectedNote).not.toBeNull();
  await act(async () => result.current.changeKnob("levelGate", 0.1));
  expect(result.current.selectedNote).toBeNull();
  await act(async () => result.current.undo());
  expect(result.current.items.length).toBeGreaterThan(0);
  expect(result.current.selectedNote).toBeNull();
});
