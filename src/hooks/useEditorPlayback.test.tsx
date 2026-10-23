import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { Frame } from "../notes";
import type { Recording } from "../db";
import { useEditor } from "./useEditor";

const state = vi.hoisted(() => ({
  saves: [] as Recording[],
  downloads: [] as { blob: Blob; name: string }[],
  handles: [] as { position: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[],
  notes: [] as unknown[][],
  output: null as (() => void) | null,
  external: false,
  frames: null as Frame[] | null,
}));
vi.mock("../db", () => ({
  getRecording: async (id: string): Promise<Recording> => ({
    id,
    name: id,
    createdAt: 1,
    sampleRate: 48000,
    durationSec: 1,
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
vi.mock("../codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("../recorder", async (original) => ({
  ...(await original<typeof import("../recorder")>()),
  analyzeBuffer: () =>
    state.frames ??
    Array.from({ length: 12 }, (_, i) => ({ t: i * 0.05, freq: 440, clarity: 0.99, rms: 0.1 })),
}));
vi.mock("../playback", () => {
  const handle = () => {
    const h = { position: vi.fn((): number | null => 0.25), stop: vi.fn() };
    state.handles.push(h);
    return h;
  };
  return {
    playPcm: handle,
    playNotes: (...args: unknown[]) => {
      state.notes.push(args);
      return handle();
    },
  };
});
vi.mock("../midiout", () => ({
  activeOutput: () => (state.external ? {} : null),
  onOutputChange: (cb: () => void) => {
    state.output = cb;
    return () => {
      state.output = null;
    };
  },
}));
vi.mock("../ui", async (original) => ({
  ...(await original<typeof import("../ui")>()),
  downloadBlob: (blob: Blob, name: string) => state.downloads.push({ blob, name }),
}));
function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}
let callbacks: Map<number, FrameRequestCallback>;
let nextId: number;
beforeEach(() => {
  state.saves = [];
  state.downloads = [];
  state.handles = [];
  state.notes = [];
  state.external = false;
  state.frames = null;
  callbacks = new Map();
  nextId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.set(++nextId, cb);
    return nextId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function editor() {
  const hook = renderHook(({ id }) => useEditor(id), { wrapper, initialProps: { id: "one" } });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("one"));
  return hook;
}
function tick() {
  const pending = [...callbacks.values()];
  callbacks.clear();
  act(() => pending.forEach((cb) => cb(1)));
}
it("toggles audio, switches to MIDI and stops when playback finishes", async () => {
  const { result } = await editor();
  act(() => result.current.togglePlayback("audio"));
  expect(result.current.playing).toBe("audio");
  tick();
  expect(result.current.position).toBe(0.25);
  act(() => result.current.togglePlayback("audio"));
  expect(result.current.playing).toBeNull();
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
  act(() => result.current.togglePlayback("audio"));
  act(() => result.current.togglePlayback("midi"));
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
  expect(result.current.playing).toBe("midi");
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69, start: 0, duration: 0.5 }]);
  state.handles.at(-1)!.position.mockReturnValue(null);
  tick();
  expect(result.current.playing).toBeNull();
  expect(result.current.position).toBeNull();
});
it("stops on output changes, take changes and unmount and unsubscribes", async () => {
  const hook = await editor();
  act(() => hook.result.current.togglePlayback("midi"));
  state.external = true;
  act(() => state.output?.());
  expect(hook.result.current.externalOutput).toBe(true);
  expect(hook.result.current.playing).toBeNull();
  act(() => hook.result.current.togglePlayback("audio"));
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
  act(() => hook.result.current.togglePlayback("audio"));
  hook.unmount();
  expect(state.handles[2]?.stop).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
  expect(state.output).toBeNull();
});
it("flushes tuning to the old take before loading another take", async () => {
  const hook = await editor();
  vi.useFakeTimers();
  act(() => hook.result.current.changeTuning("minDurationSec", 120));
  hook.rerender({ id: "two" });
  expect(state.saves).toMatchObject([{ id: "one", tuning: { minDurationSec: 0.12 } }]);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => vi.advanceTimersByTime(500));
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
it("exports playable MIDI, PCM WAV and diagnostics from the loaded take", async () => {
  const { result } = await editor();
  act(() => {
    result.current.downloadMidi();
    result.current.downloadWav();
    result.current.downloadJson();
  });
  const [midi, wav, json] = state.downloads;
  expect(midi?.name).toMatch(/\.mid$/);
  expect(wav?.name).toMatch(/\.wav$/);
  expect(json?.name).toMatch(/\.json$/);
  const midiBytes = new Uint8Array(await read(midi!.blob));
  expect(Array.from(midiBytes.subarray(0, 4))).toEqual([77, 84, 104, 100]);
  expect([...midiBytes]).toEqual(expect.arrayContaining([69]));
  const wavBytes = new DataView(await read(wav!.blob));
  expect(wavBytes.getUint32(24, true)).toBe(48000);
  expect(wavBytes.getUint32(40, true)).toBe(96000);
  const data = JSON.parse(new TextDecoder().decode(await read(json!.blob)));
  expect(data).toMatchObject({ title: "one", config: { sampleRate: 48000 } });
});
it("selects report text when clipboard access fails", async () => {
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: async () => {
        throw new Error("denied");
      },
    },
  });
  const { result } = await editor();
  const textarea = document.createElement("textarea");
  const select = vi.spyOn(textarea, "select");
  result.current.logRef.current = textarea;
  await act(async () => {
    await result.current.copyLog();
  });
  expect(result.current.reportText).toContain("diapason diagnostics: one");
  expect(result.current.copyStatus).toContain("select");
  expect(select).toHaveBeenCalledOnce();
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
  act(() => hook.result.current.clickRoll(event));
  act(() => hook.result.current.clickRoll(event));
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69, start: 0 }]);
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  hook.unmount();
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
});
it("ignores a clipboard completion from a previous take", async () => {
  let resolve!: () => void;
  vi.stubGlobal("navigator", {
    clipboard: {
      writeText: () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    },
  });
  const hook = await editor();
  let copying!: Promise<void>;
  act(() => {
    copying = hook.result.current.copyLog();
  });
  expect(hook.result.current.reportText).toContain("one");
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  await act(async () => {
    resolve();
    await copying;
  });
  expect(hook.result.current.reportText).toBe("");
  expect(hook.result.current.copyStatus).toBe("");
});
it("ignores an obsolete playback animation callback after starting a new take", async () => {
  const hook = await editor();
  act(() => hook.result.current.togglePlayback("audio"));
  const oldTick = [...callbacks.values()][0]!;
  hook.rerender({ id: "two" });
  await waitFor(() => expect(hook.result.current.record?.id).toBe("two"));
  act(() => hook.result.current.togglePlayback("midi"));
  act(() => oldTick(1));
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
    events.push({ tick, status, key: bytes[offset++]!, velocity: bytes[offset++]! });
  }
  return events;
}
it("exports only enabled notes and applies the selected grid to MIDI event timing", async () => {
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
  act(() =>
    result.current.clickRoll({
      currentTarget: canvas,
      clientX: 10,
      clientY: 71,
      ctrlKey: true,
      metaKey: false,
    } as Parameters<typeof result.current.clickRoll>[0]),
  );
  expect(result.current.notesLabel).toContain("1 notes · 1 muted");
  act(() => result.current.downloadMidi());
  expect(midiEvents(new Uint8Array(await read(state.downloads[0]!.blob)))).toEqual([
    { tick: 720, status: 0x90, key: 72, velocity: 96 },
    { tick: 960, status: 0x80, key: 72, velocity: 0 },
  ]);
  act(() => result.current.changeQuantize(false, 2));
  act(() => result.current.downloadMidi());
  expect(midiEvents(new Uint8Array(await read(state.downloads[1]!.blob)))).toEqual([
    { tick: 605, status: 0x90, key: 72, velocity: 96 },
    { tick: 941, status: 0x80, key: 72, velocity: 0 },
  ]);
});
