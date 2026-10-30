import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import type { BinaryLike } from "node:crypto";
import { join } from "node:path";
import type { InputIdentity } from "../../src/Inspection/Inspection.type.ts";
export const digest = (value: BinaryLike) => createHash("sha256").update(value).digest("hex");
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .filter((k) => record[k] !== undefined)
        .map((k) => [k, canonical(record[k])]),
    );
  }
  return value;
}
const key = (value: unknown) => digest(JSON.stringify(canonical(value)));
export const stageKey = (identity: string | null, stage: string, dependencies: unknown) =>
  identity ? key({ schemaVersion: 1, identity, stage, dependencies }) : null;
export const runKey = (
  identity: string | null,
  input: Pick<InputIdentity, "wavSha256">,
  recipe: unknown,
) => stageKey(identity, "run", { wavSha256: input.wavSha256, recipe, reportSchema: 1 });
async function sources(directory: string, suffix: RegExp): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sources(path, suffix);
      return entry.isFile() &&
        suffix.test(entry.name) &&
        !/\.(test|integration\.test)\./.test(entry.name)
        ? [path]
        : [];
    }),
  );
  return nested.flat().sort();
}
export async function codeRuntimeIdentity(
  root: string,
  runtime = JSON.stringify({
    node: process.version,
    versions: process.versions,
    arch: process.arch,
    platform: process.platform,
  }),
) {
  try {
    const paths = [
      ...(await sources(join(root, "src"), /\.(ts|tsx)$/)),
      ...(await sources(join(root, "tools"), /\.ts$/)),
      join(root, "package-lock.json"),
      join(root, "vite.config.ts"),
    ];
    // Vite configuration defines injected build/pipeline semantics as well as module loading.
    const files = await Promise.all(
      paths.map(async (path) => [path.slice(root.length + 1), digest(await readFile(path))]),
    );
    return key({ schemaVersion: 1, runtime, files });
  } catch {
    return null;
  }
}
