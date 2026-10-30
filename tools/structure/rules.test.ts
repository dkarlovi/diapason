// @vitest-environment node
import { expect, it } from "vitest";
import { exportFindings, thinModules, verdict, type Files, type GraphModule } from "./rules.ts";

const project = (sources: Record<string, string>): Files => ({
  read: (path) => sources[path] ?? "",
  exists: (path) => path in sources,
});
const graph = (edges: Record<string, string[]>): GraphModule[] =>
  Object.entries(edges).map(([source, targets]) => ({
    source,
    dependencies: targets.map((resolved) => ({ resolved })),
  }));

it("reports a small untested module that only one module imports", () => {
  const modules = graph({ "src/A/Main.ts": ["src/A/Tiny.ts"], "src/A/Tiny.ts": [] });
  expect(thinModules(modules, project({ "src/A/Tiny.ts": "export const x = 1;\n" }))).toEqual([
    { key: "src/A/Tiny.ts", message: "src/A/Tiny.ts (1 lines) is only used by src/A/Main.ts" },
  ]);
});

it("keeps small modules that have their own test, are hooks, or have several importers", () => {
  const modules = graph({
    "src/A/Main.ts": ["src/A/Tested.ts", "src/A/useThing.ts", "src/A/Shared.ts"],
    "src/A/Other.ts": ["src/A/Shared.ts"],
    "src/A/Tested.ts": [],
    "src/A/useThing.ts": [],
    "src/A/Shared.ts": [],
  });
  const files = project({
    "src/A/Tested.ts": "export const x = 1;",
    "src/A/Tested.test.ts": "",
    "src/A/useThing.ts": "export const useThing = 1;",
    "src/A/Shared.ts": "export const y = 1;",
  });
  expect(thinModules(modules, files)).toEqual([]);
});

it("counts a type file as an importer", () => {
  const modules = graph({
    "src/A/Main.ts": ["src/A/Fields.ts"],
    "src/A/Main.type.ts": ["src/A/Fields.ts"],
    "src/A/Fields.ts": [],
  });
  expect(thinModules(modules, project({ "src/A/Fields.ts": "export const F = [];" }))).toEqual([]);
});

it("reports a name declared by two modules but not a single declaration", () => {
  const files = project({
    "src/A/One.ts": "export function encode() {}\nexport const only = 1;",
    "src/B/Two.ts": "const encode = () => 2;\nexport { encode };",
  });
  expect(exportFindings(["src/A/One.ts", "src/B/Two.ts"], files).sharedNames).toEqual([
    { key: "encode", message: "encode is exported by src/A/One.ts, src/B/Two.ts" },
  ]);
});

it("reports every way of passing on another module's export", () => {
  const files = project({
    "src/A/Barrel.ts": [
      'import { local } from "./Real";',
      'export { other } from "./Real";',
      'export * from "./All";',
      "export { local };",
      "export const own = 1;",
    ].join("\n"),
  });
  const { reExports, sharedNames } = exportFindings(["src/A/Barrel.ts"], files);
  expect(reExports).toEqual([
    {
      key: "src/A/Barrel.ts",
      message: "src/A/Barrel.ts re-exports other from ./Real, * from ./All, local",
    },
  ]);
  expect(sharedNames).toEqual([]);
});

it("fails findings the allowlist does not excuse and allowlist entries that match nothing", () => {
  const findings = [
    { key: "kept", message: "kept is shared" },
    { key: "new", message: "new is shared" },
  ];
  expect(verdict("shared-name", findings, { kept: "reason", gone: "reason" })).toEqual([
    "shared-name: new is shared",
    "shared-name: stale .structurerc.json entry gone matches no finding",
  ]);
});
