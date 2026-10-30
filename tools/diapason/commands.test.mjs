// @vitest-environment node
import { expect, it } from "vitest";
import { runCli } from "./commands.mjs";
async function invoke(argv) {
  const output = { stdout: "", stderr: "" };
  const code = await runCli(argv, {
    stdout: (text) => {
      output.stdout += text;
    },
    stderr: (text) => {
      output.stderr += text;
    },
  });
  return { ...output, code };
}
it("shows registered command help without opening a recording", async () => {
  const output = await invoke(["--help"]);
  expect(output.code).toBe(0);
  expect(output.stderr).toBe("");
  expect(output.stdout).toContain("inspect");
  expect(output.stdout).toContain("notes");
});
it.each(["json", "markdown"])("keeps %s usage diagnostics on stdout", async (format) => {
  const output = await invoke(["unknown", "--format", format]);
  expect(output.code).toBe(2);
  expect(output.stderr).toBe("");
  expect(output.stdout).not.toContain("\x1b");
  if (format === "json")
    expect(JSON.parse(output.stdout)).toMatchObject({
      kind: "error",
      overall: "fail",
      data: { error: { code: "commander.unknownCommand" } },
    });
  else expect(output.stdout).toContain("unknown command");
});
it("rejects contradictory format choices before opening an input", async () => {
  const output = await invoke(["inspect", "/does/not/exist.wav", "--json", "--format", "markdown"]);
  expect(output.code).toBe(2);
  expect(JSON.parse(output.stdout).data.error.message).toContain("conflicts");
});
it("keeps ordinary usage errors on stderr", async () => {
  const output = await invoke(["inspect", "/does/not/exist.wav", "--raw"]);
  expect(output.code).toBe(2);
  expect(output.stdout).toBe("");
  expect(output.stderr).toContain("--raw requires");
});
it("emits a successful cache report without reading or writing disabled storage", async () => {
  const output = await invoke([
    "cache",
    "status",
    "--cache-dir",
    "/does/not/exist/cache",
    "--no-cache",
    "--json",
  ]);
  expect(output.code).toBe(0);
  expect(JSON.parse(output.stdout)).toMatchObject({
    kind: "cache.status",
    overall: "pass",
    data: { entries: 0, bytes: 0, enabled: false },
  });
});
