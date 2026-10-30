// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codeRuntimeIdentity, runKey, stageKey } from "./identity.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
it("invalidates current computations for uncommitted production, CLI, dependency and runtime changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "diapason-identity-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await mkdir(join(root, "tools/diapason"), { recursive: true });
  await writeFile(join(root, "package-lock.json"), "{}");
  await writeFile(join(root, "vite.config.ts"), "config");
  const initial = await codeRuntimeIdentity(root);
  expect(initial).toMatch(/^[a-f0-9]{64}$/);
  for (const file of ["src/pitch.ts", "tools/diapason/runtime.ts", "package-lock.json"]) {
    const before = await codeRuntimeIdentity(root);
    await writeFile(join(root, file), "changed");
    expect(await codeRuntimeIdentity(root)).not.toBe(before);
  }
  expect(await codeRuntimeIdentity(root, "other-runtime")).not.toBe(
    await codeRuntimeIdentity(root),
  );
  await writeFile(join(root, "src/pitch.test.ts"), "test only");
  const stable = await codeRuntimeIdentity(root);
  await writeFile(join(root, "src/pitch.test.ts"), "changed test");
  expect(await codeRuntimeIdentity(root)).toBe(stable);
  expect(await codeRuntimeIdentity(join(root, "missing"))).toBeNull();
});
it("shares frames across controls without sharing edited conclusions", () => {
  const acoustic = { pcmSha256: "pcm", sampleRate: 48000, detector: { clarity: 0.8 } };
  expect(stageKey("code", "frames", acoustic)).toBe(
    stageKey("code", "frames", { detector: { clarity: 0.8 }, sampleRate: 48000, pcmSha256: "pcm" }),
  );
  expect(stageKey("code", "frames", acoustic)).not.toBe(
    stageKey("code", "frames", { ...acoustic, detector: { clarity: 0.9 } }),
  );
  expect(runKey("code", { wavSha256: "one" }, { intent: "automatic" })).not.toBe(
    runKey("code", { wavSha256: "two" }, { intent: "automatic" }),
  );
  expect(runKey("code", { wavSha256: "one" }, { intent: "automatic" })).not.toBe(
    runKey("code", { wavSha256: "one" }, { intent: "apply" }),
  );
  expect(stageKey(null, "frames", acoustic)).toBeNull();
});
