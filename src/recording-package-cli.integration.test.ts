// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { captureRecordingPackage, encodeRecordingPackage } from "./recording-package";
import { recording } from "./test-support/recording";
import { analyzeRecording } from "./recording-analysis";
async function exec(file: string, args: string[], options: { cwd: string }) {
  const result = spawnSync(file, args, { ...options, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw Object.assign(new Error(result.stderr), { code: result.status, stdout: result.stdout });
  return { stdout: result.stdout, stderr: result.stderr };
}
const cli = resolve("bin/diapason");
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "diapason cli "));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});
async function makePackage() {
  const pcm = new Float32Array(4800);
  const r = recording({ sampleRate: 48000, durationSec: 0.1 });
  const frames = analyzeRecording(pcm, r.sampleRate, r);
  const blob = await encodeRecordingPackage(
    captureRecordingPackage(
      r,
      pcm,
      frames,
      { browser: "test", audioOutput: "unknown", midiOutput: "Browser synth" },
      1,
    ),
  );
  const file = join(dir, "my recording.wav");
  await writeFile(file, new Uint8Array(await blob.arrayBuffer()));
  return file;
}
it("inspects and compares repeatedly from outside the repo without changing the WAV", async () => {
  const file = await makePackage();
  const before = await readFile(file);
  const inspection = await exec(process.execPath, [cli, "inspect", file, "--json"], { cwd: dir });
  expect(inspection.stdout, inspection.stderr).not.toBe("");
  expect(JSON.parse(inspection.stdout)).toMatchObject({
    schemaVersion: 2,
    recording: { name: "Whistle" },
  });
  const out = join(dir, "comparison output");
  const compared = await exec(process.execPath, [cli, "compare", file, "--out", out], { cwd: dir });
  expect(compared.stdout).toContain("match");
  for (const name of ["saved.mid", "edited.mid", "automatic.mid"])
    expect((await readFile(join(out, name))).subarray(0, 4).toString()).toBe("MThd");
  expect(JSON.parse(await readFile(join(out, "comparison.json"), "utf8")).status).toBe("match");
  expect(await readFile(file)).toEqual(before);
  await expect(
    exec(process.execPath, [cli, "compare", file, "--out", out], { cwd: dir }),
  ).rejects.toHaveProperty("code", 2);
}, 20000);
it("returns usage errors on stderr with exit 2", async () => {
  await expect(exec(process.execPath, [cli, "unknown"], { cwd: dir })).rejects.toMatchObject({
    code: 2,
    stdout: "",
  });
});

it("reports a replay mismatch and preserves the original saved MIDI", async () => {
  const { readRecordingPackage } = await import("./recording-package");
  const { encodeWav } = await import("./wav");
  const file = await makePackage();
  const bytes = await readFile(file);
  const input = await readRecordingPackage(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  if (input.metadata.schemaVersion !== 2) throw new Error("package");
  input.metadata.frames[0]!.rms += 0.01;
  const altered = encodeWav(input.pcm, input.sampleRate, [
    { id: "dpsn", data: new TextEncoder().encode(JSON.stringify(input.metadata)) },
  ]);
  const alteredPath = join(dir, "old-analysis.wav");
  await writeFile(alteredPath, new Uint8Array(await altered.arrayBuffer()));
  const output = join(dir, "different analysis");
  await expect(
    exec(process.execPath, [cli, "compare", alteredPath, "--out", output], { cwd: dir }),
  ).rejects.toHaveProperty("code", 1);
  expect(await readFile(join(output, "saved.mid"))).toEqual(Buffer.from(input.metadata.midiBytes));
  expect(JSON.parse(await readFile(join(output, "comparison.json"), "utf8")).difference).toContain(
    "frames",
  );
}, 15000);
it("inspects legacy WAVs but refuses comparison without a saved melody", async () => {
  const { encodeTaggedWav } = await import("./wav-metadata");
  const old = encodeTaggedWav(recording(), new Float32Array(48000), {
    browser: "test",
    audioOutput: "unknown",
    midiOutput: "Browser synth",
  });
  const file = join(dir, "legacy.wav");
  await writeFile(file, new Uint8Array(await old.arrayBuffer()));
  expect((await exec(process.execPath, [cli, "inspect", file], { cwd: dir })).stdout).toContain(
    "Capture-only",
  );
  await expect(
    exec(process.execPath, [cli, "compare", file, "--out", join(dir, "legacy-output")], {
      cwd: dir,
    }),
  ).rejects.toHaveProperty("code", 2);
}, 15000);
