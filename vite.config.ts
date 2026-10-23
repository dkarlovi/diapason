import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

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
  .filter(
    (file) =>
      /\.(ts|tsx)$/.test(file) && !file.includes(".test.") && !file.startsWith("test-support/"),
  )
  .sort()) {
  sourceHash.update(file).update(readFileSync(`src/${file}`));
}
const source = sourceHash.digest("hex");
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __APP_BUILD__: JSON.stringify({ version, revision, source, pipeline: 2 }) },
  plugins: [react()],
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test-support/**"],
      reportsDirectory: "coverage",
      reporter: ["text", "json", "json-summary", "html"],
    },
  },
  base: "/diapason/",
  server: {
    // getUserMedia requires a secure context; localhost qualifies, so plain http is fine.
    host: "localhost",
    port: 5173,
    open: true,
  },
});
