// @vitest-environment node
import { expect, it } from "vitest";
import { encodeWav } from "./wav";
import { encodeAudio, decodeAudio } from "./codec";

it("exports stored PCM without quantizing positive samples a second time", async () => {
  const integers = [-32768, -16384, -1, 0, 1, 16383, 32767];
  const pcm = Float32Array.from(integers, (sample) => sample / 32768);
  const bytes = new DataView(await encodeWav(pcm, 48000).arrayBuffer());
  expect(bytes.getUint32(24, true)).toBe(48000);
  expect(bytes.getUint32(40, true)).toBe(14);
  expect(integers.map((_, index) => bytes.getInt16(44 + index * 2, true))).toEqual(integers);
  expect([...pcm]).toEqual(integers.map((sample) => sample / 32768));
});

it("preserves decoded storage samples through WAV and clips out-of-range input", async () => {
  const pcm = await decodeAudio(await encodeAudio(new Float32Array([-2, -0.5, 0, 0.5, 2])));
  const wav = new DataView(await encodeWav(pcm, 44100).arrayBuffer());
  expect([...pcm].map((_, index) => wav.getInt16(44 + index * 2, true))).toEqual([
    -32768, -16384, 0, 16384, 32767,
  ]);
});
