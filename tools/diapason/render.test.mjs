// @vitest-environment node
import { expect, it } from "vitest";
import { renderReport, commandText } from "./render.mjs";
const report = {
  schemaVersion: 1,
  kind: "inspect",
  input: { path: "/tmp/song.wav" },
  overall: "incomplete",
  scope: { total: 0, returned: 0, offset: 0, limit: 20, omitted: 0 },
  findings: [],
  data: {
    name: "Whistle | Δ",
    durationSeconds: 0.5,
    sampleRate: 48000,
    bpm: 95,
    beatsPerBar: 4,
    noteCount: 1,
    pitchCorrections: 0,
    muteCount: 0,
    frameCount: 43,
  },
  nextSteps: [
    {
      code: "inspect.raw",
      reason: "Read complete original package",
      argv: ["bin/diapason", "inspect", "/tmp/song.wav", "--raw", "--json"],
    },
  ],
};
it("serializes agent Markdown without terminal escapes and with runnable next commands", () => {
  const output = renderReport(report, { format: "markdown", color: "always", width: 80 });
  expect(output).toContain("Whistle");
  expect(output).toContain("```sh");
  expect(output).toContain("--raw");
  expect(output).not.toContain("\x1b");
  expect(output).toContain("incomplete");
});
it("makes JSON independent of terminal width and coloring", () => {
  expect(JSON.parse(renderReport(report, { format: "json", color: "always", width: 20 }))).toEqual(
    report,
  );
});
it("quotes user paths as arguments rather than shell expressions", () => {
  const path = "/tmp/a ' $(touch BAD) `false`\nΔ.wav";
  const command = commandText(["bin/diapason", "inspect", path]);
  expect(command).toContain("inspect");
  // Let a shell only print the arguments: no command expansion may occur.
  const { stdout, status } = spawnSync(
    "bash",
    ["-c", "set -- " + command + "; printf '%s' \"$3\""],
    { encoding: "utf8" },
  );
  expect(status).toBe(0);
  expect(stdout).toBe(path);
});
import { spawnSync } from "node:child_process";

it("retains detailed check deltas, findings, pagination and diagnostic paths in both human formats", () => {
  const detailed = {
    ...report,
    kind: "verify",
    overall: "mismatch",
    scope: { total: 25, returned: 20, offset: 0, limit: 20, omitted: 5 },
    findings: [{ severity: "info", message: "Historical observations differ." }],
    data: {
      checks: [
        {
          id: "replay.edited",
          status: "mismatch",
          reason: "Frame drift",
          difference: { maxNumericDelta: { absolute: 2e-9, path: "frames[2].rms" } },
        },
      ],
      error: {
        code: "malformed",
        message: "Invalid metadata",
        path: "audio.sha256",
        check: "pcm.identity",
      },
    },
  };
  for (const format of ["text", "markdown"]) {
    const rendered = renderReport(detailed, { format, color: "never", width: 120 });
    for (const value of [
      "replay.edited",
      "Frame drift",
      "2e-9",
      "rms",
      "Historical observations differ.",
      "20 of 25",
      "audio.sha256",
      "pcm.identity",
    ])
      expect(rendered).toContain(value);
    expect(rendered).not.toContain("\x1b");
  }
});
