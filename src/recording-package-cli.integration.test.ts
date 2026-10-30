// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { captureRecordingPackage, encodeRecordingPackage } from "./recording-package";
import { recording } from "../tests/support/recording";
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
  const inspection = await exec(process.execPath, [cli, "inspect", file, "--raw", "--json"], {
    cwd: dir,
  });
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

it("prints focused summaries in JSON and Markdown without exporting files", async () => {
  const file = await makePackage();
  const json = await exec(process.execPath, [cli, "inspect", file, "--json"], { cwd: dir });
  expect(JSON.parse(json.stdout)).toMatchObject({
    schemaVersion: 1,
    kind: "inspect",
    execution: { interpretationVersion: 1 },
    data: { name: "Whistle" },
  });
  const markdown = await exec(process.execPath, [cli, "inspect", file, "--format", "markdown"], {
    cwd: dir,
  });
  expect(markdown.stdout).toContain("Whistle");
  expect(markdown.stdout).not.toContain("\x1b");
  const bad = spawnSync(
    process.execPath,
    [cli, "inspect", file, "--format", "json", "--json", "--color", "invalid"],
    { cwd: dir, encoding: "utf8" },
  );
  expect(bad.status).toBe(2);
  expect(JSON.parse(bad.stdout)).toMatchObject({ kind: "error", overall: "fail" });
}, 15000);

it("reports JSON usage and damaged input errors without mixing stderr into stdout", async () => {
  const file = await makePackage();
  const damaged = join(dir, "damaged.wav");
  await writeFile(damaged, "not a WAV");
  for (const args of [
    ["unknown", "--json"],
    ["inspect", file, "--json", "--format", "markdown"],
    ["inspect", damaged, "--json"],
    ["inspect", file, "--json", "--note", "nonsense"],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      kind: "error",
      overall: "fail",
    });
  }
  const colored = await exec(process.execPath, [cli, "inspect", file, "--color", "always"], {
    cwd: dir,
  });
  expect(colored.stdout).toContain("\x1b[");
  const plain = await exec(process.execPath, [cli, "inspect", file, "--color", "never"], {
    cwd: dir,
  });
  expect(plain.stdout).not.toContain("\x1b[");
}, 15000);
it("verifies packages by default and supports a focused read-only comparison", async () => {
  const file = await makePackage();
  const verified = await exec(process.execPath, [cli, "verify", file, "--json"], { cwd: dir });
  expect(JSON.parse(verified.stdout)).toMatchObject({
    kind: "verify",
    overall: "pass",
    data: {
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "source.non-mutation", status: "pass" }),
      ]),
    },
  });
  const summary = await exec(process.execPath, [cli, "inspect", file, "--format", "markdown"], {
    cwd: dir,
  });
  expect(summary.stdout).toContain("replay.edited");
  expect(summary.stdout).not.toContain("verification has not run");
  const compared = await exec(process.execPath, [cli, "compare", file, "--json"], { cwd: dir });
  expect(JSON.parse(compared.stdout)).toMatchObject({ kind: "compare", overall: "pass" });
}, 15000);

it("keeps cold, warm and disabled cache verification equivalent and exposes cache maintenance", async () => {
  const file = await makePackage();
  const cache = join(dir, "private-cache");
  const run = async (extra: string[] = []) =>
    JSON.parse(
      (
        await exec(
          process.execPath,
          [cli, "verify", file, "--cache-dir", cache, "--json", ...extra],
          { cwd: dir },
        )
      ).stdout,
    );
  const cold = await run();
  const warm = await run();
  const fresh = await run(["--no-cache"]);
  expect(cold.data.provenance[0].disposition).toBe("recomputed");
  expect(warm.data.provenance[0].disposition).toBe("reused");
  expect(fresh.data.provenance[0].disposition).toBe("recomputed");
  expect(warm.data.checks).toEqual(cold.data.checks);
  expect(fresh.data.checks).toEqual(cold.data.checks);
  expect(cold.execution.codeRuntimeKey).toMatch(/^[a-f0-9]{64}$/);
  const status = async () =>
    JSON.parse(
      (
        await exec(process.execPath, [cli, "cache", "status", "--cache-dir", cache, "--json"], {
          cwd: dir,
        })
      ).stdout,
    );
  expect((await status()).data.entries).toBeGreaterThan(0);
  await exec(process.execPath, [cli, "cache", "clear", "--cache-dir", cache], { cwd: dir });
  expect((await status()).data.entries).toBe(0);
}, 20000);

it("browses full-context notes, controls and source stages with complete paginated reports", async () => {
  const { investigationInput } = await import("../tests/support/investigation");
  const { bytes } = await investigationInput();
  const file = join(dir, "queries.wav");
  await writeFile(file, new Uint8Array(bytes));
  const query = async (kind: string, extra: string[] = []) =>
    JSON.parse(
      (await exec(process.execPath, [cli, kind, file, "--json", ...extra], { cwd: dir })).stdout,
    );
  const all = await query("notes", ["--all"]);
  expect(all.data.rows[0]).toMatchObject({ id: 1, intendedMidi: null });
  expect((await query("notes", ["--note", "1"])).data.rows).toEqual(all.data.rows);
  expect((await query("notes", ["--corrected"])).data.rows).toEqual([]);
  const automatic = await query("notes", ["--view", "automatic"]);
  expect(automatic.view).toBe("automatic");
  const selected = await query("notes", ["--view", "automatic", "--time", "0.1:0.3"]);
  expect(selected.data.rows).toEqual(
    automatic.data.rows.filter(
      (row: { source: { start: number; end: number } }) =>
        row.source.start < 0.3 && row.source.end > 0.1,
    ),
  );
  const controls = await query("controls", ["--all"]);
  const first = await query("controls", ["--limit", "5"]);
  const rest = await query("controls", ["--offset", "5", "--limit", "20"]);
  expect([...first.data.rows, ...rest.data.rows]).toEqual(controls.data.rows);
  expect(first.scope.omitted).toBeGreaterThan(0);
  expect((await query("stages", ["--view", "replay", "--note", "1"])).data.rows[0]).toMatchObject({
    kind: "matched",
    firstDifferingStage: null,
  });
  const markdown = await exec(process.execPath, [cli, "notes", file, "--format", "markdown"], {
    cwd: dir,
  });
  expect(markdown.stdout).toContain("B5");
  for (const extra of [
    ["--note", "999"],
    ["--time", "NaN:2"],
    ["--note", "1", "--time", "0:1"],
    ["--limit", "-1"],
  ])
    await expect(query("notes", extra)).rejects.toHaveProperty("code", 2);
}, 25000);
