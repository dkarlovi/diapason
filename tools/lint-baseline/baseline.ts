export interface Diagnostic {
  code: string;
  filename: string;
  message: string;
  labels?: { span: { line: number; column: number } }[];
}
/** Finding counts per file, then per rule. */
export type LintBaseline = Record<string, Record<string, number>>;

export function countFindings(diagnostics: Diagnostic[]): LintBaseline {
  const counts: LintBaseline = {};
  const order = (d: Diagnostic) => `${d.filename}\0${d.code}`;
  for (const { filename, code } of [...diagnostics].sort((a, b) =>
    order(a) < order(b) ? -1 : order(a) > order(b) ? 1 : 0,
  )) {
    const rules = (counts[filename] ??= {});
    rules[code] = (rules[code] ?? 0) + 1;
  }
  return counts;
}

const location = (d: Diagnostic) => {
  const span = d.labels?.[0]?.span;
  return span ? `${d.filename}:${span.line}:${span.column}` : d.filename;
};

const entries = (counts: LintBaseline) =>
  Object.entries(counts).flatMap(([file, rules]) =>
    Object.entries(rules).map(([rule, count]) => ({ file, rule, count })),
  );

function grown(diagnostics: Diagnostic[], current: LintBaseline, saved: LintBaseline) {
  return entries(current).flatMap(({ file, rule, count }) => {
    const allowed = saved[file]?.[rule] ?? 0;
    if (count <= allowed) return [];
    return [
      `${file}: ${rule} has ${count} findings, baseline allows ${allowed}`,
      ...diagnostics
        .filter((d) => d.filename === file && d.code === rule)
        .map((d) => `  ${location(d)} ${d.message}`),
    ];
  });
}

const shrunk = (current: LintBaseline, saved: LintBaseline) =>
  entries(saved).flatMap(({ file, rule, count: allowed }) => {
    const count = current[file]?.[rule] ?? 0;
    return count < allowed
      ? [
          `${file}: ${rule} is down to ${count} from ${allowed}; lower the baseline with npm run lint:baseline`,
        ]
      : [];
  });

/** Every way the current findings differ from the saved baseline, as one line each. */
export function compareFindings(diagnostics: Diagnostic[], saved: LintBaseline): string[] {
  const current = countFindings(diagnostics);
  return [...grown(diagnostics, current, saved), ...shrunk(current, saved)];
}
