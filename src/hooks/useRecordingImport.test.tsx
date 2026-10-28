import { Blob as NodeBlob } from "node:buffer";
import { CompressionStream, DecompressionStream } from "node:stream/web";
import "fake-indexeddb/auto";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useRecordingImport } from "./useRecordingImport";
import { allRecordings, deleteRecording } from "../db";
import { createPortableTune } from "../portable-tune";
import { noteRecording } from "../test-support/note-recording";
import { tuneUrl } from "../tune-url";
vi.stubGlobal("Blob", NodeBlob);
vi.stubGlobal("CompressionStream", CompressionStream);
vi.stubGlobal("DecompressionStream", DecompressionStream);
afterEach(async () => {
  cleanup();
  for (const r of await allRecordings()) await deleteRecording(r.id);
});
it("offers links without saving, cancels cleanly, and imports a fresh complete record only on confirmation", async () => {
  const notice = vi.fn();
  const reload = vi.fn(async () => {});
  const { result } = renderHook(() => useRecordingImport(reload, notice));
  const tune = createPortableTune(noteRecording(), []);
  const hash = new URL(await tuneUrl(tune, "https://example.com")).hash;
  await act(() => result.current.offerUrl(hash));
  expect(result.current.candidates?.[0]?.tune?.name).toBe("Shared");
  expect(await allRecordings()).toEqual([]);
  act(() => result.current.cancel());
  expect(await allRecordings()).toEqual([]);
  await act(() => result.current.offerUrl(hash));
  await act(() => result.current.confirm());
  const records = await allRecordings();
  expect(records).toHaveLength(1);
  expect(records[0]?.id).not.toBe("fixed");
  expect(records[0]?.audio).toBeUndefined();
  expect(records[0]?.editHead).toBeUndefined();
  expect(records[0]?.play).toEqual({ instrument: "flute", octave: -2 });
});
it("ignores stale inspection after cancellation and reports invalid links", async () => {
  const { result } = renderHook(() => useRecordingImport(async () => {}, vi.fn()));
  const hash = new URL(
    await tuneUrl(createPortableTune(noteRecording(), []), "https://example.com"),
  ).hash;
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.offerUrl(hash);
    result.current.cancel();
  });
  await act(() => pending);
  expect(result.current.candidates).toBeNull();
  await act(() => result.current.offerUrl("#tune=broken"));
  await waitFor(() => expect(result.current.candidates?.[0]?.error).toBeTruthy());
  expect(await allRecordings()).toEqual([]);
});

it("offers tagged MIDI files through the same explicit import process", async () => {
  const { encodeTuneMidi } = await import("../tune-midi");
  const { notesToMidi } = await import("../midi");
  const { result } = renderHook(() => useRecordingImport(async () => {}, vi.fn()));
  const blob = await encodeTuneMidi(createPortableTune(noteRecording(), []));
  const file = {
    name: "shared.mid",
    type: "audio/midi",
    size: blob.size,
    arrayBuffer: () => blob.arrayBuffer(),
  } as File;
  await act(() => result.current.offerFiles([file]));
  expect(result.current.candidates?.[0]?.tune?.play).toEqual({ instrument: "flute", octave: -2 });
  expect(await allRecordings()).toEqual([]);
  await act(() => result.current.confirm());
  expect(await allRecordings()).toHaveLength(1);
  const plain = notesToMidi([]);
  await act(() =>
    result.current.offerFiles([
      {
        name: "ordinary.mid",
        type: "audio/midi",
        size: plain.size,
        arrayBuffer: () => plain.arrayBuffer(),
      } as File,
    ]),
  );
  expect(result.current.candidates?.[0]?.error).toMatch(/Diapason/);
  expect(await allRecordings()).toHaveLength(1);
});
