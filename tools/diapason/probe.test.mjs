// @vitest-environment node
import { expect, it } from "vitest";
import { probeWav } from "./probe.mjs";
it("reports an unavailable independent interoperability check as skipped", async () => {
  const result = await probeWav(
    "/tmp/test.wav",
    { sampleRate: 48000, sampleCount: 24000 },
    {
      exec: async () => {
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    },
  );
  expect(result).toMatchObject({ id: "wav.interoperability", status: "skipped", optional: true });
});
it("checks the external WAV format without evaluating a file path as shell syntax", async () => {
  const file = "/tmp/a $(false).wav";
  const calls = [];
  const exec = async (command, args) => {
    calls.push({ command, args });
    return {
      stdout: args.includes("-version")
        ? "ffprobe version test\n"
        : JSON.stringify({
            streams: [
              { codec_name: "pcm_s16le", sample_rate: "48000", channels: 1, duration: "0.500000" },
            ],
            format: { format_name: "wav" },
          }),
    };
  };
  const result = await probeWav(file, { sampleRate: 48000, sampleCount: 24000 }, { exec });
  expect(result.status).toBe("pass");
  expect(calls[1].args.at(-1)).toBe(file);
});
it("reports contradictory external format evidence as a failure", async () => {
  const exec = async (_command, args) => ({
    stdout: args.includes("-version")
      ? "ffprobe version test"
      : JSON.stringify({
          streams: [
            { codec_name: "pcm_s16le", sample_rate: "44100", channels: 2, duration: "0.5" },
          ],
          format: { format_name: "wav" },
        }),
  });
  expect(
    (await probeWav("/tmp/test.wav", { sampleRate: 48000, sampleCount: 24000 }, { exec })).status,
  ).toBe("fail");
});
