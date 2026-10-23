import { afterEach, expect, it, vi } from "vitest";
import { createRecorder } from "./recorder";
const nodes: {
  port: {
    onmessage: ((event: { data: { samples: Float32Array; start: number } }) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}[] = [];
function context() {
  return {
    currentTime: 1,
    sampleRate: 10,
    audioWorklet: { addModule: vi.fn(async () => {}) },
  } as unknown as AudioContext;
}
function setup() {
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
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  nodes.length = 0;
});
it("registers recorder worklets per context, including after changing microphones", async () => {
  const source = setup(),
    first = context(),
    second = context();
  const a = await createRecorder(first, source),
    b = await createRecorder(second, source);
  expect(first.audioWorklet.addModule).toHaveBeenCalledOnce();
  expect(second.audioWorklet.addModule).toHaveBeenCalledOnce();
  a.dispose();
  b.dispose();
});
it("uses audio timestamps to exclude queued pre-start samples", async () => {
  const source = setup(),
    ctx = context();
  const recorder = await createRecorder(ctx, source);
  recorder.start();
  nodes[0]!.port.onmessage?.({ data: { samples: new Float32Array([9, 9, 0.5, 0.6]), start: 0.8 } });
  expect([...recorder.stop()]).toEqual([0.5, expect.closeTo(0.6, 5)]);
  recorder.dispose();
});

it("analyzes a saved tone using effective source settings without deleting beat windows", async () => {
  const { analyzeBuffer } = await import("./recorder");
  const pcm = Float32Array.from(
    { length: 8000 },
    (_, i) => 0.1 * Math.sin((2 * Math.PI * 440 * i) / 8000),
  );
  const frames = analyzeBuffer(pcm, 8000, {
    minFreq: 200,
    maxFreq: 1000,
    windowSize: 512,
    hop: 128,
  });
  expect(frames[0]?.freq).toBeCloseTo(440, 0);
  expect(frames.find((frame) => frame.t >= 0.15)?.freq).toBeCloseTo(440, 0);
  expect(frames.find((frame) => frame.t >= 0.48)?.freq).toBeCloseTo(440, 0);
});
