import { Blob as NodeBlob } from "node:buffer";
import { CompressionStream, DecompressionStream } from "node:stream/web";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAdHocTune } from "./useAdHocTune";
import { tuneUrl } from "../../Tune/TuneUrl";
import { createPortableTune } from "../../Tune/PortableTune";
import { noteRecording } from "../../../tests/support/note-recording";
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("CompressionStream", CompressionStream);
  vi.stubGlobal("DecompressionStream", DecompressionStream);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const fragment = async () =>
  new URL(await tuneUrl(createPortableTune(noteRecording(), []), "https://example.com")).hash;
it("recovers unblurred names after refresh and clears discarded work", async () => {
  const hash = await fragment();
  const first = renderHook(() => useAdHocTune(hash));
  await waitFor(() => expect(first.result.current.session).toBeTruthy());
  act(() =>
    first.result.current.session!.updateDraft((draft) => ({ ...draft, name: "Unblurred" })),
  );
  expect(first.result.current.session!.dirty).toBe(true);
  first.unmount();
  const second = renderHook(() => useAdHocTune(hash));
  await waitFor(() => expect(second.result.current.session?.getRecord().name).toBe("Unblurred"));
  act(() => second.result.current.session!.discard());
  second.unmount();
  const third = renderHook(() => useAdHocTune(hash));
  await waitFor(() => expect(third.result.current.session?.getRecord().name).toBe("Shared"));
});
it("keeps an in-memory editor usable when session storage is blocked", async () => {
  const hash = await fragment();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const { result } = renderHook(() => useAdHocTune(hash));
  await waitFor(() => expect(result.current.session).toBeTruthy());
  act(() => result.current.session!.updateDraft((draft) => ({ ...draft, name: "Still editable" })));
  expect(result.current.session!.getRecord().name).toBe("Still editable");
  expect(result.current.session!.warning).toMatch(/refresh/i);
});
it("ignores an old decode that resolves after a newer link", async () => {
  const tunes = await import("../../Tune/TuneUrl");
  const original = createPortableTune(noteRecording(), []);
  let resolveOld!: (tune: typeof original) => void;
  const pending = new Promise<typeof original>((resolve) => {
    resolveOld = resolve;
  });
  vi.spyOn(tunes, "tuneFromFragment")
    .mockImplementationOnce(() => pending)
    .mockResolvedValueOnce({ ...original, name: "Second tune" });
  const { result, rerender } = renderHook(({ hash }) => useAdHocTune(hash), {
    initialProps: { hash: "#tune=one" },
  });
  rerender({ hash: "#tune=two" });
  await waitFor(() => expect(result.current.session?.getRecord().name).toBe("Second tune"));
  await act(async () => {
    resolveOld(original);
    await pending;
  });
  expect(result.current.session?.getRecord().name).toBe("Second tune");
  expect(sessionStorage.length).toBe(0);
});
