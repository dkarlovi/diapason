import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
export const digest = (value) => createHash("sha256").update(value).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((k) => value[k] !== undefined)
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
const key = (value) => digest(JSON.stringify(canonical(value)));
export const stageKey = (identity, stage, dependencies) =>
  identity ? key({ schemaVersion: 1, identity, stage, dependencies }) : null;
export const runKey = (identity, input, recipe) =>
  stageKey(identity, "run", { wavSha256: input.wavSha256, recipe, reportSchema: 1 });
async function sources(directory, suffix) {
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
  root,
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
      ...(await sources(join(root, "tools"), /\.mjs$/)),
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
