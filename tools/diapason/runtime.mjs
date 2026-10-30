import { codeRuntimeIdentity, runKey, stageKey } from "./identity.mjs";
import { createStageStore } from "./cache.mjs";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export async function openInvestigation(file, options = {}) {
  const path = resolve(file);
  const bytes = await readFile(path);
  const wavSha256 = hash(bytes);
  const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
  const { createServer } = await import("vite");
  const previousCwd = process.cwd();
  let server;
  try {
    process.chdir(root);
    server = await createServer({
      root,
      configFile: resolve(root, "vite.config.ts"),
      mode: "replay",
      logLevel: "silent",
      server: { middlewareMode: true, hmr: false, ws: false, watch: null },
      appType: "custom",
    });
    const api = await server.ssrLoadModule("/src/Inspection/Api.ts");
    const input = await api.readRecordingPackage(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const identity = {
      path,
      wavSha256,
      pcmSha256: input.metadata.schemaVersion === 2 ? input.metadata.audio.sha256 : null,
      sampleRate: input.sampleRate,
      sampleCount: input.pcm.length,
    };
    const codeRuntimeKey = await codeRuntimeIdentity(root);
    const stages = createStageStore({
      directory: options.cacheDir,
      scope: wavSha256,
      enabled: options.cache !== false,
      diagnostic: options.diagnostic,
    });
    const context = {
      input,
      identity,
      execution: {
        codeRuntimeKey,
        runKey: runKey(codeRuntimeKey, identity, {
          mode: "verification",
          metadata: input.metadata,
        }),
        build: api.BUILD_INFO,
        pipelineVersion: api.BUILD_INFO.pipeline,
        interpretationVersion:
          input.metadata.schemaVersion === 2
            ? input.metadata.tune.noteSource.interpretationVersion
            : 1,
      },
      stages,
      stageKey: (stage, dependencies) => stageKey(codeRuntimeKey, stage, dependencies),
    };
    return {
      context,
      api,
      close: async () => {
        await server.close();
        process.chdir(previousCwd);
      },
      assertUnchanged: async () => {
        if (hash(await readFile(path)) !== wavSha256)
          throw new Error("Input WAV changed during investigation.");
      },
    };
  } catch (error) {
    await server?.close();
    process.chdir(previousCwd);
    throw error;
  }
}
