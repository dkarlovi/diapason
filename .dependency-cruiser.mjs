// Layering for the layout described in .ls-lint.yml:
//   src/App, src/Features/*, src/UI  — React
//   every other src/* folder         — domain logic, framework-free
//   tools/                           — CLI views over src/Inspection
//   tests/                           — shared fixtures and support for *.test.* files

const react = "node_modules/(react|react-dom|react-router|@radix-ui|lucide-react)/";
const reactLayer = "^src/(App|Features|UI)/";
const domainLayer = "^src/(?!App/|Features/|UI/)[^/]+/";
const testFile = "\\.test\\.tsx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "domain-without-react",
      comment: "Domain folders hold logic that runs without React: in tests, workers, and the CLI.",
      severity: "error",
      from: { path: domainLayer },
      to: { path: [react, reactLayer] },
    },
    {
      name: "model-is-pure",
      comment: "*.model.ts files are pure calculations: no React, hooks, or storage.",
      severity: "error",
      from: { path: "\\.model\\.ts$" },
      to: { path: [react, "(^|/)use[A-Z][^/]*$", "^src/Storage/", "\\.storage\\.ts$"] },
    },
    {
      name: "type-is-type-only",
      comment: "*.type.ts files declare shapes and depend on nothing at runtime.",
      severity: "error",
      from: { path: "\\.type\\.ts$" },
      to: { dependencyTypesNot: ["type-only"] },
    },
    {
      name: "storage-behind-storage-modules",
      comment: "IndexedDB access goes through src/Storage, used only by *.storage.ts files.",
      severity: "error",
      from: { pathNot: ["^src/Storage/", "\\.storage\\.ts$", testFile] },
      to: { path: "^src/Storage/" },
    },
    {
      name: "ui-is-generic",
      comment: "src/UI holds design-system parts that know nothing about screens or storage.",
      severity: "error",
      from: { path: "^src/UI/" },
      to: { path: "^src/(App|Features|Storage)/" },
    },
    {
      name: "features-are-isolated",
      comment: "A feature never reaches into another; share through src/UI or a domain folder.",
      severity: "error",
      from: { path: "^src/Features/([^/]+)/" },
      to: { path: "^src/Features/", pathNot: "^src/Features/$1/" },
    },
    {
      name: "app-is-the-top",
      severity: "error",
      from: { path: "^src/", pathNot: ["^src/App/", "^src/main\\.tsx$"] },
      to: { path: "^src/App/" },
    },
    {
      name: "src-not-to-tools",
      comment: "tools/ is a view over src/, never a dependency of it.",
      severity: "error",
      from: { path: "^src/" },
      to: { path: "^tools/" },
    },
    {
      name: "tools-through-inspection",
      comment: "The CLI renders data; the logic and its public API live in src/Inspection.",
      severity: "error",
      from: { path: "^tools/" },
      to: { path: "^src/", pathNot: "^src/Inspection/" },
    },
    {
      name: "test-support-only-in-tests",
      severity: "error",
      from: { path: "^(src|tools)/", pathNot: testFile },
      to: { path: ["^tests/", testFile] },
    },
  ],
  options: {
    // TypeScript 7 has no JS API yet, so dependency-cruiser parses with swc.
    parser: "swc",
    // The npm script still passes the scan roots and --ignore-known: the config format has no
    // field for either (options.ignoreKnown is read only from the CLI).
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
