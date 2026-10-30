import { lstat, mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, basename } from "node:path";
export async function publishOutputs(
  directory: string,
  entries: Record<string, string | Uint8Array>,
  inputPath: string,
): Promise<string[]> {
  const files = Object.entries(entries).map(([name, content]) => {
    if (name !== basename(name) || name === "." || name === "..")
      throw new Error("Invalid output name.");
    const path = resolve(directory, name);
    if (path === resolve(inputPath)) throw new Error("Output would overwrite the input WAV.");
    return [path, content] as const;
  });
  for (const [path] of files) {
    try {
      await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Output already exists: ${path}`);
  }
  await mkdir(directory, { recursive: true });
  const created: string[] = [];
  try {
    for (const [path, content] of files) {
      await writeFile(path, content, { flag: "wx" });
      created.push(path);
    }
  } catch (error) {
    await Promise.allSettled(created.map((path) => unlink(path)));
    throw error;
  }
  return created;
}
