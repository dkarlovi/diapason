// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir, readdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStageStore } from "./cache.ts";
const roots: string[] = [];
async function temporary() {
  const p = await mkdtemp(join(tmpdir(), "diapason-cache-test-"));
  roots.push(p);
  return p;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
const key = "a".repeat(64);
it("publishes complete concurrent entries and rejects corrupt checksums", async () => {
  const directory = await temporary();
  const store = createStageStore({ directory });
  await Promise.all(
    Array.from({ length: 8 }, () =>
      store.write(key, { frames: [1.4830000000000003, null, 0.9, 0.001] }),
    ),
  );
  expect(await store.read(key)).toEqual({ frames: [1.4830000000000003, null, 0.9, 0.001] });
  const [entry = ""] = await readdir(directory);
  const parsed = JSON.parse(await readFile(join(directory, entry), "utf8"));
  parsed.value = "corrupted";
  await writeFile(join(directory, entry), JSON.stringify(parsed));
  expect(await store.read(key)).toBeUndefined();
  await writeFile(join(directory, entry), "{");
  expect(await store.read(key)).toBeUndefined();
});
it("bypasses disabled caches and falls back on unavailable storage", async () => {
  const root = await temporary();
  const directory = join(root, "disabled");
  const store = createStageStore({ directory, enabled: false });
  await store.write(key, [1]);
  expect(await store.read(key)).toBeUndefined();
  expect(await readdir(root)).toEqual([]);
  await writeFile(join(root, "file"), "occupied");
  const broken = createStageStore({ directory: join(root, "file/cache") });
  await expect(broken.write(key, [1])).resolves.toBeUndefined();
  expect(await broken.read(key)).toBeUndefined();
});
it("confines writes and clearing to its private root without following symlinks", async () => {
  const root = await temporary();
  const outside = await temporary();
  await writeFile(join(outside, "keep"), "safe");
  const directory = join(root, "linked");
  await symlink(outside, directory);
  const linked = createStageStore({ directory });
  await linked.write(key, [1]);
  await linked.clear();
  expect(await readdir(outside)).toEqual(["keep"]);
  const owned = join(root, "owned");
  await mkdir(owned);
  await symlink(join(outside, "keep"), join(owned, `${key}.json`));
  const store = createStageStore({ directory: owned });
  expect(await store.read(key)).toBeUndefined();
  await store.write(key, [2]);
  await store.clear();
  expect(await readFile(join(outside, "keep"), "utf8")).toBe("safe");
});
it("evicts completed entries by size and reports bounded cache status", async () => {
  const directory = await temporary();
  const store = createStageStore({ directory, maxBytes: 1 });
  await store.write(key, [1]);
  expect(await store.read(key)).toBeUndefined();
  expect(await store.status()).toMatchObject({ entries: 0, bytes: 0 });
});

it("scopes maintenance to the requested WAV and expires idle entries", async () => {
  const directory = await temporary();
  const first = createStageStore({ directory, scope: "1".repeat(64) });
  const second = createStageStore({ directory, scope: "2".repeat(64) });
  await first.write(key, [1]);
  await second.write("b".repeat(64), [2]);
  expect((await first.status()).entries).toBe(1);
  await first.clear();
  expect(await second.read("b".repeat(64))).toEqual([2]);
  const { utimes } = await import("node:fs/promises");
  await utimes(join(directory, `${"b".repeat(64)}.json`), new Date(0), new Date(0));
  expect(await second.read("b".repeat(64))).toBeUndefined();
  expect((await second.status()).entries).toBe(0);
});

it("rejects a symlinked parent before creating a cache directory outside its root", async () => {
  const root = await temporary();
  const outside = await temporary();
  await symlink(outside, join(root, "parent"));
  const store = createStageStore({ directory: join(root, "parent/new-cache") });
  await store.write(key, [1]);
  expect(await readdir(outside)).toEqual([]);
});
