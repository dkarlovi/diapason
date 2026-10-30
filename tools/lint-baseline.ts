// Runs oxlint and holds its findings to .oxlint-baseline.json, since oxlint has no baseline of
// its own. A count that grows fails with the new findings; a count that shrinks fails until the
// baseline is lowered, so the file only ever ratchets down. `--save` rewrites the baseline.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  compareFindings,
  countFindings,
  type Diagnostic,
  type LintBaseline,
} from "./lint-baseline/baseline.ts";

const BASELINE = ".oxlint-baseline.json";
const run = spawnSync("node_modules/.bin/oxlint", ["--format", "json", "."], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (run.error || !run.stdout)
  throw run.error ?? new Error(run.stderr || "oxlint produced no output");
const { diagnostics } = JSON.parse(run.stdout) as { diagnostics: Diagnostic[] };

if (process.argv.includes("--save")) {
  writeFileSync(BASELINE, JSON.stringify(countFindings(diagnostics), null, 2) + "\n");
} else {
  const saved = existsSync(BASELINE)
    ? (JSON.parse(readFileSync(BASELINE, "utf8")) as LintBaseline)
    : {};
  const problems = compareFindings(diagnostics, saved);
  for (const problem of problems) console.error(problem);
  process.exitCode = problems.length ? 1 : 0;
}
