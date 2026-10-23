import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createServer } from "vite";

const { values } = parseArgs({
  options: {
    json: { type: "string" },
    wav: { type: "string" },
    out: { type: "string" },
  },
});
if (!values.json || !values.wav || !values.out) {
  console.error(
    "Usage: npm run debug:recording -- --json report.json --wav recording.wav --out directory",
  );
  process.exitCode = 2;
} else {
  // A non-development mode keeps the build identity the replay compares against.
  const server = await createServer({
    mode: "replay",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
  });
  try {
    const { replayDiagnostics } = await server.ssrLoadModule("/src/diagnostics-replay.ts");
    const report = JSON.parse(await readFile(values.json, "utf8"));
    const wav = await readFile(values.wav);
    const bytes = wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength);
    const result = await replayDiagnostics(report, bytes);
    const summary = {
      status: result.status,
      build: result.build,
      difference: result.difference,
      notes: result.notes?.length,
    };
    console.log(JSON.stringify(summary, null, 2));
    await mkdir(values.out, { recursive: true });
    await writeFile(resolve(values.out, "replay.json"), JSON.stringify(summary, null, 2) + "\n");
    if (result.midi)
      await writeFile(
        resolve(values.out, "replayed.mid"),
        new Uint8Array(await result.midi.arrayBuffer()),
      );
    if (result.status !== "match") process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await server.close();
  }
}
