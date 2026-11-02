// @vitest-environment node
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";

it("compiles application components for browser and test transforms", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
    import { createServer } from "vite";
    const server = await createServer({
      configFile: "vite.config.ts",
      logLevel: "silent",
      server: { middlewareMode: true },
    });
    try {
      const results = [];
      for (const ssr of [false, true]) {
        const result = await server.transformRequest("/src/UI/Button.tsx", { ssr });
        results.push(result.code);
      }
      process.stdout.write(JSON.stringify(results));
    } finally {
      await server.close();
    }
  `,
    ],
    { encoding: "utf8" },
  );
  const results = JSON.parse(output) as string[];
  expect(results).toHaveLength(2);
  for (const code of results) {
    expect(code).toMatch(/react[/_]compiler-runtime/);
  }
});
