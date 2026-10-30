import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VerificationCheck } from "../../src/Inspection/Verification.ts";

interface ProbeOutput {
  format?: { format_name?: string };
  streams: { codec_name?: string; channels?: number; sample_rate?: string; duration?: string }[];
}
interface ExpectedWav {
  sampleRate: number | null;
  sampleCount: number | null;
}
type Exec = (
  file: string,
  args: string[],
  options: { encoding: "utf8"; timeout: number; maxBuffer: number },
) => Promise<{ stdout: string }>;
export type ProbeCheck = VerificationCheck & {
  tool?: { name: string; version: string | undefined };
};
const execute: Exec = promisify(execFile);
function matchesWav(data: ProbeOutput, expected: ExpectedWav) {
  const stream = data.streams?.[0];
  return (
    data.format?.format_name?.split(",").includes("wav") &&
    data.streams.length === 1 &&
    stream !== undefined &&
    stream.codec_name === "pcm_s16le" &&
    stream.channels === 1 &&
    Number(stream.sample_rate) === expected.sampleRate &&
    Math.abs(
      Number(stream.duration) * Number(expected.sampleRate) - Number(expected.sampleCount),
    ) <= 1
  );
}
export async function probeWav(
  path: string,
  expected: ExpectedWav,
  { exec = execute }: { exec?: Exec } = {},
): Promise<ProbeCheck> {
  const check: ProbeCheck = {
    id: "wav.interoperability",
    optional: true,
    status: "skipped",
    reason: "ffprobe unavailable.",
  };
  try {
    const version = await exec("ffprobe", ["-version"], {
      encoding: "utf8",
      timeout: 10000,
      maxBuffer: 1048576,
    });
    check.tool = { name: "ffprobe", version: version.stdout.split("\n")[0] };
    const result = await exec(
      "ffprobe",
      ["-v", "error", "-show_streams", "-show_format", "-of", "json", path],
      { encoding: "utf8", timeout: 30000, maxBuffer: 1048576 },
    );
    const data = JSON.parse(result.stdout) as ProbeOutput;
    const matches = matchesWav(data, expected);
    return {
      ...check,
      status: matches ? "pass" : "fail",
      reason: matches
        ? "Independent WAV format, rate, channels and duration agree."
        : "ffprobe format evidence disagrees with the validated WAV.",
    };
  } catch (caught) {
    const error = caught as NodeJS.ErrnoException;
    return {
      ...check,
      status: error.code === "ENOENT" ? "skipped" : "fail",
      reason:
        error.code === "ENOENT"
          ? "ffprobe is not installed; independent interoperability check skipped."
          : `ffprobe failed: ${error.message}`,
    };
  }
}
