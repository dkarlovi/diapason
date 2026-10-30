import { expect, it } from "vitest";
import { packFrames, unpackFrames } from "./Frame.storage";
it("preserves null frequencies and full numeric precision without database imports", () => {
  const frames = [
    { t: 1.4830000000000003, freq: null, clarity: 0.1234567890123456, rms: 1e-12 },
    { t: 2, freq: 440.00000000000006, clarity: 1, rms: 0 },
  ];
  expect(unpackFrames(packFrames(frames))).toEqual(frames);
});
