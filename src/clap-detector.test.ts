import { expect, it } from "vitest";
import { createClapDetector } from "./clap-detector";
it("counts impulses once across irregular chunks and ignores a sustained tone", () => {
  const pcm = new Float32Array(2400);
  for (const index of [100, 600, 1100, 1600, 2100]) {
    pcm[index] = 0.8;
    pcm[index + 1] = 0.3;
  }
  const detector = createClapDetector(1000, 0.001);
  const onsets: number[] = [];
  for (let start = 0; start < pcm.length; start += 37)
    onsets.push(...detector.process(pcm.subarray(start, start + 37), start / 1000));
  expect(onsets).toHaveLength(5);
  expect(onsets[0]).toBeCloseTo(0.1, 2);
  expect(onsets[4]).toBeCloseTo(2.1, 2);
  detector.reset();
  expect(detector.process(new Float32Array(2000).fill(0.1), 0)).toEqual([]);
});
it("rejects noise-relative quiet impulses and a clap tail inside the refractory period", () => {
  const pcm = new Float32Array(1000);
  pcm[100] = 0.8;
  pcm[150] = 0.8;
  expect(createClapDetector(1000, 0.001).process(pcm, 0)).toHaveLength(1);
  expect(createClapDetector(1000, 0.1).process(pcm, 0)).toEqual([]);
});
