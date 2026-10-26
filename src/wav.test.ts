// @vitest-environment node
import { expect, it } from "vitest";
import { encodeWav, wavBytes } from "./wav";
import { decodeWav, wavChunks } from "./wav-reader";
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

it("appends extra chunks after data with padding and a correct RIFF size", () => {
  const bytes = wavBytes(Float32Array.of(0, 0.5), 48000, [
    { id: "abcd", data: Uint8Array.of(1, 2, 3) },
  ]);
  const view = new DataView(bytes);
  expect(bytes.byteLength).toBe(44 + 4 + 8 + 4);
  expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
  expect(String.fromCharCode(...new Uint8Array(bytes, 48, 4))).toBe("abcd");
  expect(view.getUint32(52, true)).toBe(3);
  expect(view.getUint8(59)).toBe(0);
});

it("lists chunks and still decodes tagged files", () => {
  const pcm = Float32Array.of(0, 0.5);
  const tagged = wavBytes(pcm, 48000, [{ id: "abcd", data: Uint8Array.of(1, 2, 3) }]);
  expect(wavChunks(tagged).map(({ id, length }) => [id, length])).toEqual([
    ["fmt ", 16],
    ["data", 4],
    ["abcd", 3],
  ]);
  expect(decodeWav(tagged).pcm).toEqual(decodeWav(wavBytes(pcm, 48000)).pcm);
});
