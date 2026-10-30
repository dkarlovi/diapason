import { afterEach, expect, it, vi } from "vitest";
import { subscribePcm } from "./ClapInput";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("forwards audio-clock PCM and disposes subscriptions without accepting queued messages", async () => {
  const nodes: {
    port: {
      onmessage: ((event: MessageEvent) => void) | null;
      postMessage: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
  }[] = [];
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      port = { onmessage: null, postMessage: vi.fn(), close: vi.fn() };
      constructor() {
        nodes.push(this);
      }
      disconnect() {}
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:claps");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  const makeContext = () =>
    ({
      state: "running",
      audioWorklet: { addModule: vi.fn(async () => {}) },
    }) as unknown as AudioContext;
  const source = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
  const times: number[] = [];
  const ctx = makeContext(),
    second = makeContext();
  const off = await subscribePcm(ctx, source, (_samples, start) => times.push(start));
  const late = nodes[0]!.port.onmessage!;
  late(new MessageEvent("message", { data: { samples: new Float32Array([0.5]), start: 2 } }));
  off();
  off();
  late(new MessageEvent("message", { data: { samples: new Float32Array([0.5]), start: 3 } }));
  expect(times).toEqual([2]);
  expect(nodes[0]!.port.close).toHaveBeenCalledOnce();
  const stopSecond = await subscribePcm(second, source, () => {});
  stopSecond();
  expect(ctx.audioWorklet.addModule).toHaveBeenCalledOnce();
  expect(second.audioWorklet.addModule).toHaveBeenCalledOnce();
});
