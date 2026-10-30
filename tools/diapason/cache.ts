import { constants } from "node:fs";
import type { Stats } from "node:fs";
import { open, lstat, mkdir, readdir, realpath, rename, unlink, chmod } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { resolve, join, parse, sep } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { digest } from "./identity.ts";
import type { StageStore as InspectionStageStore } from "../../src/Inspection/Inspection.type.ts";

export interface CacheStatus {
  directory: string;
  entries: number;
  bytes: number;
  enabled: boolean;
  available?: false;
}
export interface CacheStageStore extends InspectionStageStore {
  status(): Promise<CacheStatus>;
  clear(): Promise<void>;
}
export interface StageStoreOptions {
  directory?: string | undefined;
  enabled?: boolean;
  maxBytes?: number;
  maxIdleMs?: number;
  scope?: string | undefined;
  diagnostic?: ((message: string) => void) | undefined;
}
interface CacheEntry {
  schemaVersion: 1;
  key: string;
  checksum: string;
  value: unknown;
}
interface CachedFile {
  path: string;
  bytes: number;
  touched: number;
}
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
const defaultCacheDirectory = () =>
  join(tmpdir(), `diapason-${process.getuid?.() ?? "user"}`, "cache/v1");
const validKey = (key: unknown): key is string =>
  typeof key === "string" && /^[a-f0-9]{64}$/.test(key);
async function ensureDirectory(directory: string) {
  let parent = parse(directory).root;
  for (const part of directory.slice(parent.length).split(sep).filter(Boolean)) {
    parent = join(parent, part);
    try {
      await mkdir(parent, { mode: 0o700 });
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    }
    const component = await lstat(parent);
    if (!component.isDirectory() || component.isSymbolicLink())
      throw new Error("Cache path must not contain symlinks.");
  }
  return lstat(directory);
}
const ownedFile = (stat: Stats) =>
  stat.isFile() && (!process.getuid || stat.uid === process.getuid());
async function readEntry(
  handle: FileHandle,
  key: string,
  maxBytes: number,
  maxIdleMs: number,
): Promise<CacheEntry | undefined> {
  const stat = await handle.stat();
  if (!stat.isFile() || stat.size > maxBytes || Date.now() - stat.mtimeMs > maxIdleMs) return;
  const entry = JSON.parse(await handle.readFile("utf8")) as CacheEntry;
  if (
    entry.schemaVersion !== 1 ||
    entry.key !== key ||
    entry.checksum !== digest(JSON.stringify(entry.value))
  )
    return;
  return entry;
}
export function createStageStore({
  directory = defaultCacheDirectory(),
  enabled = true,
  maxBytes = 1073741824,
  maxIdleMs = 604800000,
  scope,
  diagnostic = () => {},
}: StageStoreOptions = {}): CacheStageStore {
  const root = resolve(directory);
  if (scope !== undefined && !validKey(scope)) throw new Error("Invalid cache WAV scope.");
  const reference = (key: string) => join(root, `${scope}.${key}.ref`);
  async function mark(key: string) {
    if (!scope) return;
    let handle: FileHandle | undefined;
    try {
      handle = await open(
        reference(key),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw error;
    } finally {
      await handle?.close();
    }
  }
  const report = (error: unknown) =>
    diagnostic(`Cache unavailable; recomputing when needed: ${(error as Error).message}`);
  async function ready() {
    const stat = await ensureDirectory(root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await realpath(root)) !== root ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error("Cache root must be an owned directory without symlinks.");
    await chmod(root, 0o700);
  }
  async function selected(path: string, name: string, scoped: boolean) {
    const stat = await lstat(path);
    if (!ownedFile(stat)) return;
    if (scope && scoped) {
      const ref = await lstat(reference(name.slice(0, 64)));
      if (!ownedFile(ref)) return;
    }
    return { path, bytes: stat.size, touched: stat.mtimeMs };
  }
  async function entries(scoped = true) {
    const result: CachedFile[] = [];
    for (const name of await readdir(root)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      try {
        const entry = await selected(join(root, name), name, scoped);
        if (entry) result.push(entry);
      } catch {
        /* Concurrent removal or invalid reference. */
      }
    }
    return result;
  }
  async function prune() {
    const files = (await entries(false)).sort((a, b) => a.touched - b.touched);
    let bytes = files.reduce((sum, f) => sum + f.bytes, 0);
    for (const file of files)
      if (bytes > maxBytes || Date.now() - file.touched > maxIdleMs) {
        await unlink(file.path).catch(() => {});
        bytes -= file.bytes;
      }
  }
  return {
    async read(key) {
      if (!enabled || !validKey(key)) return undefined;
      let handle: FileHandle | undefined;
      try {
        await ready();
        const path = join(root, `${key}.json`);
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        const entry = await readEntry(handle, key, maxBytes, maxIdleMs);
        if (!entry) return undefined;
        await handle.utimes(new Date(), new Date());
        await mark(key);
        return entry.value;
      } catch (error) {
        if (errorCode(error) !== "ENOENT") report(error);
        return undefined;
      } finally {
        await handle?.close();
      }
    },
    async write(key, value) {
      if (!enabled || !validKey(key)) return;
      let temporary: string | undefined;
      try {
        await ready();
        const serialized = JSON.stringify(value);
        const entry = JSON.stringify({
          schemaVersion: 1,
          key,
          checksum: digest(serialized),
          value,
        });
        temporary = join(root, `.${randomUUID()}.tmp`);
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(entry);
        } finally {
          await handle.close();
        }
        await rename(temporary, join(root, `${key}.json`));
        await mark(key);
        await prune();
      } catch (error) {
        report(error);
      } finally {
        if (temporary) await unlink(temporary).catch(() => {});
      }
    },
    async status() {
      if (!enabled) return { directory: root, entries: 0, bytes: 0, enabled };
      try {
        await ready();
        await prune();
        const files = await entries();
        return {
          directory: root,
          entries: files.length,
          bytes: files.reduce((sum, f) => sum + f.bytes, 0),
          enabled,
        };
      } catch (error) {
        report(error);
        return { directory: root, entries: 0, bytes: 0, enabled, available: false };
      }
    },
    async clear() {
      if (!enabled) return;
      try {
        await ready();
        for (const entry of await entries()) {
          await unlink(entry.path).catch(() => {});
          if (scope)
            await unlink(reference(entry.path.split("/").at(-1)!.slice(0, 64))).catch(() => {});
        }
      } catch (error) {
        report(error);
      }
    },
  };
}
