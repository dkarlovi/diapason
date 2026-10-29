import { readFile, mkdir, writeFile, unlink, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const usage =
  "Usage: bin/diapason inspect recording.wav [--json]\n       bin/diapason compare recording.wav --out directory";
async function writeOutputs(directory, outputs) {
  const entries = Object.entries(outputs).map(([name, content]) => [
    resolve(directory, name),
    content,
  ]);
  await Promise.all(
    entries.map(async ([path]) => {
      if (
        await access(path).then(
          () => true,
          () => false,
        )
      )
        throw new Error(`Output already exists: ${path}`);
    }),
  );
  await mkdir(directory, { recursive: true });
  const created = [];
  try {
    for (const [path, content] of entries) {
      await writeFile(path, content, { flag: "wx" });
      created.push(path);
    }
  } catch (error) {
    await Promise.allSettled(created.map((path) => unlink(path)));
    throw error;
  }
  return entries.map(([path]) => path);
}
let server;
try {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { json: { type: "boolean" }, out: { type: "string" }, help: { type: "boolean" } },
  });
  if (values.help) {
    console.log(usage);
  } else {
    const [command, file] = positionals;
    if (
      positionals.length !== 2 ||
      !["inspect", "compare"].includes(command) ||
      (command === "compare" && (!values.out || values.json)) ||
      (command === "inspect" && values.out)
    )
      throw new Error(usage);
    const path = resolve(file);
    const out = values.out ? resolve(values.out) : null;
    const wav = await readFile(path);
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    process.chdir(root);
    server = await createServer({
      root,
      configFile: resolve(root, "vite.config.ts"),
      mode: "replay",
      logLevel: "silent",
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: "custom",
    });
    const { readRecordingPackage } = await server.ssrLoadModule("/src/recording-package.ts");
    const { formatPackageInspection, formatPackageComparison } = await server.ssrLoadModule(
      "/src/recording-package-report.ts",
    );
    const input = await readRecordingPackage(bytes);
    if (command === "inspect") {
      console.log(
        values.json ? JSON.stringify(input.metadata, null, 2) : formatPackageInspection(input),
      );
    } else {
      const { compareRecordingPackage } = await server.ssrLoadModule(
        "/src/recording-package-comparison.ts",
      );
      const { encodeTuneMidi } = await server.ssrLoadModule("/src/tune-midi.ts");
      const result = await compareRecordingPackage(input);
      if (!result.edited || !result.automatic || result.saved.schemaVersion !== 2)
        throw new Error(result.difference ?? "No saved melody baseline.");
      const text = formatPackageComparison(result);
      const evidence = (snapshot) => ({
        frames: snapshot.frames,
        evidence: snapshot.evidence,
        tune: snapshot.tune,
      });
      const json = {
        ...result,
        schemaVersion: 1,
        kind: "comparison",
        edited: evidence(result.edited),
        automatic: evidence(result.automatic),
      };
      const output = {
        "comparison.txt": text + "\n",
        "comparison.json": JSON.stringify(json, null, 2) + "\n",
      };
      for (const [name, tune] of [
        ["edited", result.edited.tune],
        ["automatic", result.automatic.tune],
      ])
        output[`${name}.mid`] = new Uint8Array(await (await encodeTuneMidi(tune)).arrayBuffer());
      output["saved.mid"] = Uint8Array.from(result.saved.midiBytes);
      if (Object.keys(output).some((name) => resolve(out, name) === path))
        throw new Error("Output would overwrite the input WAV.");
      const written = await writeOutputs(out, output);
      console.log(text + "\n\n" + written.join("\n"));
      if (result.status !== "match") process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
} finally {
  await server?.close();
}
