import { parseSync, type ExportNamedDeclaration, type ModuleItem } from "@swc/core";

export interface StructureFinding {
  key: string;
  message: string;
}
export interface Files {
  read(path: string): string;
  exists(path: string): boolean;
}
export interface GraphModule {
  source: string;
  dependencies: { resolved: string }[];
}
const THIN_LINES = 15;

export const isSource = (path: string) =>
  /^(src|tools)\/.*\.tsx?$/.test(path) && !/\.(test|integration\.test|d)\.tsx?$/.test(path);
const isProduction = (path: string) => isSource(path) && !path.endsWith(".type.ts");
const isHook = (path: string) => /^use[A-Z]/.test(path.slice(path.lastIndexOf("/") + 1));
const codeLines = (code: string) => code.split("\n").filter((line) => line.trim()).length;
const hasOwnTest = (path: string, files: Files) =>
  [".test.ts", ".test.tsx", ".integration.test.ts", ".integration.test.tsx"].some((suffix) =>
    files.exists(path.replace(/\.tsx?$/, suffix)),
  );

function importersOf(modules: GraphModule[]) {
  const importers = new Map<string, Set<string>>();
  for (const module of modules.filter((m) => isSource(m.source)))
    for (const { resolved } of module.dependencies.filter((d) => isSource(d.resolved)))
      importers.set(resolved, (importers.get(resolved) ?? new Set()).add(module.source));
  return importers;
}

export function thinModules(modules: GraphModule[], files: Files): StructureFinding[] {
  const importers = importersOf(modules);
  return modules.flatMap(({ source: path }) => {
    if (!isProduction(path) || isHook(path) || hasOwnTest(path, files)) return [];
    const users = [...(importers.get(path) ?? [])];
    const lines = codeLines(files.read(path));
    if (users.length !== 1 || lines > THIN_LINES) return [];
    return [{ key: path, message: `${path} (${lines} lines) is only used by ${users[0]}` }];
  });
}

const importedNames = (body: ModuleItem[]) =>
  new Set(
    body.flatMap((item) =>
      item.type === "ImportDeclaration" ? item.specifiers.map((s) => s.local.value) : [],
    ),
  );

function declarationNames(item: ModuleItem & { type: "ExportDeclaration" }): string[] {
  const declaration = item.declaration;
  switch (declaration.type) {
    case "VariableDeclaration":
      return declaration.declarations.flatMap((d) =>
        d.id.type === "Identifier" ? [d.id.value] : [],
      );
    case "TsModuleDeclaration":
      return [];
    case "FunctionDeclaration":
    case "ClassDeclaration":
      return [declaration.identifier.value];
    default:
      return [declaration.id.value];
  }
}

interface ExportedNames {
  declared: string[];
  passed: string[];
}
const NO_EXPORTS: ExportedNames = { declared: [], passed: [] };

function namedExports(item: ExportNamedDeclaration, imported: Set<string>): ExportedNames {
  const names = item.specifiers.flatMap((s) =>
    s.type === "ExportSpecifier" && s.orig.type === "Identifier"
      ? [{ local: s.orig.value, exported: (s.exported ?? s.orig).value }]
      : [],
  );
  const from = item.source?.value;
  if (from) return { declared: [], passed: names.map((n) => `${n.local} from ${from}`) };
  return {
    declared: names.filter((n) => !imported.has(n.local)).map((n) => n.exported),
    passed: names.filter((n) => imported.has(n.local)).map((n) => n.local),
  };
}

/** Each export statement split into names this module declares and names it passes on. */
function exportsOf(item: ModuleItem, imported: Set<string>): ExportedNames {
  switch (item.type) {
    case "ExportDeclaration":
      return { declared: declarationNames(item), passed: [] };
    case "ExportAllDeclaration":
      return { declared: [], passed: [`* from ${item.source.value}`] };
    case "ExportNamedDeclaration":
      return namedExports(item, imported);
    default:
      return NO_EXPORTS;
  }
}

export function exportFindings(paths: string[], files: Files) {
  const declarers = new Map<string, string[]>();
  const reExports: StructureFinding[] = [];
  for (const path of [...paths].sort()) {
    const { body } = parseSync(files.read(path), {
      syntax: "typescript",
      tsx: path.endsWith(".tsx"),
    });
    const imported = importedNames(body);
    const statements = body.map((item) => exportsOf(item, imported));
    for (const name of new Set(statements.flatMap((s) => s.declared)))
      declarers.set(name, [...(declarers.get(name) ?? []), path]);
    const passed = statements.flatMap((s) => s.passed);
    if (passed.length)
      reExports.push({ key: path, message: `${path} re-exports ${passed.join(", ")}` });
  }
  const sharedNames = [...declarers].flatMap(([name, declaredBy]) =>
    declaredBy.length > 1
      ? [{ key: name, message: `${name} is exported by ${declaredBy.join(", ")}` }]
      : [],
  );
  return { sharedNames, reExports };
}

/** Findings the allowlist does not excuse, plus allowlist entries that excuse nothing. */
export function verdict(
  rule: string,
  findings: StructureFinding[],
  allowed: Record<string, string>,
) {
  const keys = new Set(findings.map((f) => f.key));
  return [
    ...findings.filter((f) => !(f.key in allowed)).map((f) => `${rule}: ${f.message}`),
    ...Object.keys(allowed)
      .filter((key) => !keys.has(key))
      .map((key) => `${rule}: stale .structurerc.json entry ${key} matches no finding`),
  ];
}
