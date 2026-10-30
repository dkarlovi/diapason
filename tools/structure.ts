// Structure checks the import-graph and naming tools cannot express:
//   thin-module   a small file with one importer and no test of its own belongs in that importer
//   shared-name   one exported name declared by several modules lets importers pick the wrong one
//   re-export     a module passing on another module's export gives it a second import path;
//                 importers should name the module that provides it
// Deliberate exceptions live in .structurerc.json, each with a reason; an entry that no longer
// matches a finding fails too, so the list cannot go stale.
import { existsSync, readFileSync } from "node:fs";
import { cruise, type ICruiseResult } from "dependency-cruiser";
import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";
import { exportFindings, isSource, thinModules, verdict, type Files } from "./structure/rules.ts";

interface Allowlist {
  thinModules: Record<string, string>;
  sharedNames: Record<string, string>;
  reExports: Record<string, string>;
}

const files: Files = { read: (path) => readFileSync(path, "utf8"), exists: existsSync };
const allow = JSON.parse(files.read(".structurerc.json")) as Allowlist;
const { output } = await cruise(
  ["src", "tools"],
  await extractDepcruiseOptions("./.dependency-cruiser.mjs"),
);
const { modules } = output as ICruiseResult;
const exported = exportFindings(modules.map((m) => m.source).filter(isSource), files);
const problems = [
  ...verdict("thin-module", thinModules(modules, files), allow.thinModules),
  ...verdict("shared-name", exported.sharedNames, allow.sharedNames),
  ...verdict("re-export", exported.reExports, allow.reExports),
];
for (const problem of problems) console.error(problem);
process.exitCode = problems.length ? 1 : 0;
