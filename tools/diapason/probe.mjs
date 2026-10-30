import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
function matchesWav(data, expected) {
  const stream = data.streams?.[0];
  return (
    data.format?.format_name?.split(",").includes("wav") &&
    data.streams.length === 1 &&
    stream.codec_name === "pcm_s16le" &&
    stream.channels === 1 &&
    Number(stream.sample_rate) === expected.sampleRate &&
    Math.abs(Number(stream.duration) * expected.sampleRate - expected.sampleCount) <= 1
  );
}
export async function probeWav(path, expected, { exec = execute } = {}) {
  const check = {
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
    const data = JSON.parse(result.stdout);
    const matches = matchesWav(data, expected);
    return {
      ...check,
      status: matches ? "pass" : "fail",
      reason: matches
        ? "Independent WAV format, rate, channels and duration agree."
        : "ffprobe format evidence disagrees with the validated WAV.",
    };
  } catch (error) {
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
