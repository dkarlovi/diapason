// Layering for the layout described in .ls-lint.yml:
//   src/App → src/Features/* → src/Studio → src/UI  — React, each layer importing only rightwards
//   every other src/* folder                         — domain logic, framework-free
//   tools/                                           — CLI views over src/Inspection
//   tests/                                           — shared fixtures and support for *.test.* files

const react = "node_modules/(react|react-dom|react-router|@radix-ui|lucide-react)/";
const reactLayer = "^src/(App|Features|Studio|UI)/";
const domainLayer = "^src/(?!App/|Features/|Studio/|UI/)[^/]+/";
const testFile = "\\.test\\.tsx?$";

/** @returns {import('dependency-cruiser').IForbiddenRuleType} */
const rule = (name, comment, from, to) => ({ name, comment, severity: "error", from, to });

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    rule(
      "no-runtime-cycle",
      "Modules that import each other at runtime load in an order that depends on the entry point.",
      {},
      { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
    ),
    rule(
      "no-type-cycle",
      "Type-level cycles couple modules even though they vanish at runtime; move the shared shapes into *.type.ts files. Cycles among *.type.ts files alone are recursive data shapes and allowed.",
      {},
      { circular: true, via: { pathNot: "\\.type\\.ts$" } },
    ),
    rule("not-to-unresolvable", "", {}, { couldNotResolve: true }),
    rule(
      "domain-without-react",
      "Domain folders hold logic that runs without React: in tests, workers, and the CLI.",
      { path: domainLayer },
      { path: [react, reactLayer] },
    ),
    rule(
      "model-is-pure",
      "*.model.ts files are pure calculations: no React, hooks, or storage.",
      { path: "\\.model\\.ts$" },
      { path: [react, "(^|/)use[A-Z][^/]*$", "^src/Storage/", "\\.storage\\.ts$"] },
    ),
    rule(
      "type-is-type-only",
      "*.type.ts files declare shapes and depend on nothing at runtime.",
      { path: "\\.type\\.ts$" },
      { dependencyTypesNot: ["type-only"] },
    ),
    rule(
      "storage-behind-storage-modules",
      "IndexedDB access goes through src/Storage, used only by *.storage.ts files.",
      { pathNot: ["^src/Storage/", "\\.storage\\.ts$", testFile] },
      { path: "^src/Storage/" },
    ),
    rule(
      "ui-is-generic",
      "src/UI holds design-system parts that know nothing about diapason, its screens, or storage.",
      { path: "^src/UI/" },
      { path: "^src/(App|Features|Studio|Storage)/" },
    ),
    rule(
      "studio-below-features",
      "src/Studio holds diapason behaviour shared by several screens; it never reaches up into them.",
      { path: "^src/Studio/" },
      { path: "^src/(App|Features)/" },
    ),
    rule(
      "features-are-isolated",
      "A feature never reaches into another; share through src/Studio, src/UI, or a domain folder.",
      { path: "^src/Features/([^/]+)/" },
      { path: "^src/Features/", pathNot: "^src/Features/$1/" },
    ),
    rule(
      "app-is-the-top",
      "Only the entry point composes the app; tests may render it too.",
      { path: "^src/", pathNot: ["^src/App/", "^src/main\\.tsx$", testFile] },
      { path: "^src/App/" },
    ),
    rule(
      "src-not-to-tools",
      "tools/ is a view over src/, never a dependency of it.",
      { path: "^src/" },
      { path: "^tools/" },
    ),
    rule(
      "tools-through-inspection",
      "The CLI renders data; the logic and its public API live in src/Inspection.",
      { path: "^tools/" },
      { path: "^src/", pathNot: "^src/Inspection/" },
    ),
    rule(
      "test-support-only-in-tests",
      "",
      { path: "^(src|tools)/", pathNot: testFile },
      { path: ["^tests/", testFile] },
    ),
  ],
  options: {
    // TypeScript 7 has no JS API yet, so dependency-cruiser parses with swc.
    parser: "swc",
    // The npm script still passes the scan roots: the config format has no field for them.
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".tsx", ".mjs", ".js", ".d.ts"],
    },
  },
};
