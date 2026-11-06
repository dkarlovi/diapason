import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { transform } from "oxc-transform-react";
import tailwindcss from "@tailwindcss/vite";
import { PIPELINE_VERSION } from "./src/Diagnostics/BuildInfo.ts";

let revision = "unknown";
try {
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  /* Source archives may not include git metadata. */
}
const sourceHash = createHash("sha256");
for (const file of readdirSync("src", { recursive: true })
  .map(String)
  .filter((candidate) => /\.(ts|tsx)$/.test(candidate) && !candidate.includes(".test."))
  .sort()) {
  sourceHash.update(file).update(readFileSync(`src/${file}`));
}
const source = sourceHash.digest("hex");
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const reactSources = /[/\\]src[/\\](App|Features|Studio|UI)[/\\].*\.[jt]sx?$/;
const excludedReactSources = [/[/\\]node_modules[/\\]/, /\.test\./];

// A dev server keeps serving edited sources, so a startup snapshot would misidentify exports.
const identity = (live: boolean) =>
  live ? { revision: "unknown", source: "unknown" } : { revision, source };

export default defineConfig(({ command, mode }) => ({
  define: {
    __APP_BUILD__: JSON.stringify({
      version,
      ...identity(command === "serve" && mode === "development"),
      pipeline: PIPELINE_VERSION,
    }),
  },
  plugins: [
    {
      name: "react-compiler-server",
      enforce: "pre",
      transform: {
        filter: { id: { include: reactSources, exclude: excludedReactSources } },
        async handler(code, id) {
          // Vitest uses server transforms to execute client components with memoization.
          if (this.environment.config.consumer !== "server") return;
          const result = await transform(id.replace(/\?.*$/, ""), code, {
            reactCompiler: { target: "19" },
            jsx: { development: mode !== "production" },
            sourcemap: true,
          });
          if (result.fatal) this.error(result.errors.map((error) => error.message).join("\n"));
          return { code: result.code, map: result.map ?? null };
        },
      },
    },
    react({
      include: reactSources,
      exclude: excludedReactSources,
      compiler: { target: "19" },
    }),
    tailwindcss(),
    {
      name: "embed-playground",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split("?")[0] === "/diapason/diapason.js") {
            response.setHeader("Content-Type", "text/javascript; charset=utf-8");
            response.end('import "/diapason/src/Studio/Diapason.ts";');
            return;
          }
          if (request.url?.split("?")[0] !== "/diapason/dev/embed") return next();
          response.setHeader("Content-Type", "text/html; charset=utf-8");
          response.end(readFileSync(new URL("./dev/embed.html", import.meta.url), "utf8"));
        });
      },
    },
  ],
  optimizeDeps: { include: ["react/compiler-runtime"] },
  test: {
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
    setupFiles: ["tests/support/broadcast-channel.ts"],
    server: {
      deps: {
        // Material Color Utilities 0.4.0 ships extensionless ESM imports that Node cannot resolve.
        inline: ["@material/material-color-utilities"],
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}"],
      reportsDirectory: "coverage",
      reporter: ["text", "json", "json-summary", "html"],
    },
  },
  base: "/diapason/",
  build: {
    rolldownOptions: {
      input: { app: "index.html", diapason: "src/Studio/Diapason.ts" },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "diapason" ? "diapason.js" : "assets/[name]-[hash].js",
        codeSplitting: {
          groups: [{ name: "vendor", test: /[\\/]node_modules[\\/]/ }],
        },
      },
    },
  },
  server: {
    // getUserMedia requires a secure context; localhost qualifies, so plain http is fine.
    host: "localhost",
    port: 5173,
    open: true,
  },
}));
