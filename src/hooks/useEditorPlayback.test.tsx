import { webcrypto } from "node:crypto";
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
  midiError: false,
  events: [] as string[],
  duration: 1,
}));
vi.mock("../midi", async (original) => {
  const midi = await original<typeof import("../midi")>();
  const guard =
    <T extends unknown[], R>(fn: (...args: T) => R) =>
    (...args: T): R => {
      if (state.midiError) throw new Error("MIDI resolution cannot preserve distinct notes.");
      return fn(...args);
    };
  return { midiEvents: guard(midi.midiEvents), notesToMidi: guard(midi.notesToMidi) };
});
vi.mock("../db", () => ({
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
vi.mock("../codec", () => ({ decodeAudio: async () => new Float32Array(48000) }));
vi.mock("../recorder", async (original) => ({
  ...(await original<typeof import("../recorder")>()),
  analyzeBuffer: () =>
    state.frames ??
    Array.from({ length: 12 }, (_, i) => ({ t: i * 0.05, freq: 440, clarity: 0.99, rms: 0.1 })),
}));
vi.mock("../playback", () => {
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
  vi.stubGlobal("crypto", webcrypto);
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
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69, start: 0, duration: 0.6000000000000001 }]);
  state.handles.at(-1)!.position.mockReturnValue(null);
  tick();
  expect(result.current.playing).toBeNull();
  expect(result.current.position).toBeNull();
});
it("stops on output changes, recording changes and unmount and unsubscribes", async () => {
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
it("flushes tuning to the old recording before loading another recording", async () => {
  const hook = await editor();
  vi.useFakeTimers();
  act(() => hook.result.current.changeKnob("minNoteMs", 120));
  hook.rerender({ id: "two" });
  expect(state.saves).toMatchObject([{ id: "one", melody: { overrides: { minNoteMs: 120 } } }]);
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
it("exports playable MIDI, PCM WAV and diagnostics from the loaded recording", async () => {
  const { result } = await editor();
  await act(async () => {
    result.current.downloadMidi();
    result.current.downloadWav();
    await result.current.downloadJson();
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
it("reports MIDI encoding failures instead of throwing from export handlers", async () => {
  const { result } = await editor();
  state.midiError = true;
  act(() => result.current.downloadMidi());
  expect(state.downloads).toEqual([]);
  expect(result.current.copyStatus).toBe(
    "MIDI export failed: MIDI resolution cannot preserve distinct notes.",
  );
  await act(async () => {
    await result.current.copyLog();
  });
  expect(result.current.copyStatus).toBe(
    "Diagnostics failed: MIDI resolution cannot preserve distinct notes.",
  );
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
  expect(hook.result.current.selectedNote?.name).toBe("A4");
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  hook.unmount();
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
});
it("ignores a clipboard completion from a previous recording", async () => {
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
it("ignores an obsolete playback animation callback after starting a new recording", async () => {
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
  act(() => result.current.changeKnob("grid", 2));
  act(() => result.current.downloadMidi());
  expect(midiEvents(new Uint8Array(await read(state.downloads[0]!.blob)))).toEqual([
    { tick: 720, status: 0x90, key: 72, velocity: 96 },
    { tick: 960, status: 0x80, key: 72, velocity: 0 },
  ]);
  act(() => result.current.changeKnob("grid", 0));
  act(() => result.current.downloadMidi());
  expect(midiEvents(new Uint8Array(await read(state.downloads[1]!.blob)))).toEqual([
    { tick: 605, status: 0x90, key: 72, velocity: 96 },
    { tick: 989, status: 0x80, key: 72, velocity: 0 },
  ]);
});

it("pairs diagnostic JSON with the exact downloaded WAV and includes the export state", async () => {
  const { result } = await editor();
  act(() => result.current.changeKnob("grid", 0));
  await act(async () => {
    await result.current.downloadJson();
    result.current.downloadWav();
  });
  const json = state.downloads.find((item) => item.name.endsWith(".json"))!;
  const wav = state.downloads.find((item) => item.name.endsWith(".wav"))!;
  const report = JSON.parse(new TextDecoder().decode(await read(json.blob)));
  expect(report.audio).toMatchObject({
    sampleCount: 48000,
    sampleRate: 48000,
    format: "pcm16-mono",
    timelineOrigin: "recording-downbeat",
  });
  const digest = await crypto.subtle.digest("SHA-256", await read(wav.blob));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  expect(report.audio.sha256).toBe(hash);
  expect(report.settings.melody.overrides.grid).toBe(0);
});

it("does not download an obsolete JSON snapshot after navigating to another recording", async () => {
  const hook = await editor();
  let release!: (bytes: ArrayBuffer) => void;
  const pendingDigest = new Promise<ArrayBuffer>((resolve) => {
    release = resolve;
  });
  const digest = vi.spyOn(crypto.subtle, "digest").mockReturnValueOnce(pendingDigest);
  let exporting!: Promise<void>;
  act(() => {
    exporting = hook.result.current.downloadJson();
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
  act(() =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(state.notes[0]?.[0]).toMatchObject([{ midi: 69 }]);
  expect(state.saves).toEqual([]);
  expect(JSON.stringify(hook.result.current.record)).toBe(before);
  expect(hook.result.current.previewId).toBe("preset-gentle");
  act(() =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(state.handles[0]?.stop).toHaveBeenCalledOnce();
  expect(hook.result.current.previewId).toBeNull();
  act(() =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  act(() => hook.result.current.previewMelody({ preset: "clean", overrides: {} }, "preset-clean"));
  expect(state.handles[1]?.stop).toHaveBeenCalledOnce();
  hook.unmount();
  expect(state.handles[2]?.stop).toHaveBeenCalledOnce();
});
it("applying a preset clears custom controls and saves the chosen preset", async () => {
  const { result } = await editor();
  act(() => result.current.changeKnob("keyPull", 0.2));
  act(() => result.current.applyPreset("gentle"));
  expect(state.saves.at(-1)?.melody).toEqual({ preset: "gentle", key: "auto", overrides: {} });
});

it("stops a note preview before scheduling a new sequence", async () => {
  const hook = await editor();
  act(() => hook.result.current.selectNote(hook.result.current.items[0]!));
  act(() =>
    hook.result.current.previewMelody({ preset: "gentle", overrides: {} }, "preset-gentle"),
  );
  expect(state.events).toEqual(["start", "stop", "start"]);
});
it("clears the pressed preview state when changing recordings", async () => {
  const hook = await editor();
  act(() =>
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
  act(() => hook.result.current.selectNote(hook.result.current.items[2]!));
  act(() => hook.result.current.previewContext());
  tick();
  expect(hook.result.current.position).toBeCloseTo(1.25);
});
