import { resolve } from "node:path";
import { openInvestigation, type Api, type Runtime, type RuntimeOptions } from "./runtime.ts";
import { publishOutputs } from "./files.ts";
import { probeWav } from "./probe.ts";
import type { Report } from "../../src/Inspection/Inspection.type.ts";
import type { VerificationCheck } from "../../src/Inspection/Verification.ts";

export type CliResult = { raw: unknown } | { report: Report<unknown>; text?: string };
type Comparison = Awaited<ReturnType<Api["computeComparison"]>>["result"];
interface CompareData {
  files?: string[];
  [field: string]: unknown;
}
export async function withRecording<T extends CliResult>(
  file: string,
  operation: (runtime: Runtime) => Promise<T>,
  options: RuntimeOptions = {},
): Promise<T> {
  const runtime = await openInvestigation(file, options);
  let value: T;
  try {
    value = await operation(runtime);
  } finally {
    try {
      await runtime.assertUnchanged();
    } finally {
      await runtime.close();
    }
  }
  const report = "report" in value ? value.report : undefined;
  const checks = (report?.data as { checks?: unknown } | undefined)?.checks;
  if (report && Array.isArray(checks)) {
    checks.push({
      id: "source.non-mutation",
      status: "pass",
      reason: "Input WAV SHA-256 is unchanged after this invocation.",
    });
    report.overall = runtime.api.overallChecks(checks as VerificationCheck[]);
    report.scope = {
      total: checks.length,
      returned: checks.length,
      offset: 0,
      limit: 20,
      omitted: 0,
    };
  }
  return value;
}
async function verified(runtime: Runtime) {
  const report = await runtime.api.verifyPackage(runtime.context, { portable: false });
  report.data.checks.push(await probeWav(runtime.context.identity.path, runtime.context.identity));
  report.overall = runtime.api.overallChecks(report.data.checks);
  return report;
}
export async function inspectRecording(
  file: string,
  options: RuntimeOptions & { raw?: boolean },
  format: string,
) {
  return withRecording(
    file,
    async (runtime): Promise<CliResult> => {
      const { context, api } = runtime;
      if (options.raw) return { raw: context.input.metadata };
      const verification = await verified(runtime);
      const summary = api.summarizePackage(context.input, context.identity);
      const report = {
        ...summary,
        execution: context.execution,
        overall: verification.overall,
        data: { ...summary.data, checks: verification.data.checks, build: verification.data.build },
        findings: [
          ...summary.findings.filter((f) => f.code !== "verification.pending"),
          ...verification.findings,
        ],
      };
      report.nextSteps = [
        {
          code: "verify.details",
          reason: "Inspect detailed verification results and numeric deltas",
          argv: ["bin/diapason", "verify", context.identity.path, "--format", format],
        },
        ...summary.nextSteps,
      ];
      return { report };
    },
    options,
  );
}
export async function verifyRecording(file: string, options: RuntimeOptions = {}) {
  return withRecording(file, async (runtime) => ({ report: await verified(runtime) }), options);
}
export async function compareRecording(file: string, options: RuntimeOptions & { out?: string }) {
  const out = options.out ? resolve(options.out) : null;
  return withRecording(
    file,
    async ({ context, api }): Promise<CliResult> => {
      const { result, provenance } = await api.computeComparison(context);
      if (!result.edited || !result.automatic || result.saved.schemaVersion !== 2)
        throw new Error(result.difference ?? "No saved melody baseline.");
      const report = api.makeReport<CompareData>(
        "compare",
        context.identity,
        {
          provenance,
          status: result.status,
          build: result.build,
          editedDifferenceCount: result.editedDifferences?.differences.length ?? 0,
          automaticDifferenceCount: result.automaticDifferences?.differences.length ?? 0,
        },
        result.status === "match" ? "pass" : "mismatch",
      );
      report.execution = context.execution;
      if (!out) return { report };
      const { entries, text } = await comparisonOutputs(api, result, {
        saved: result.saved,
        edited: result.edited,
        automatic: result.automatic,
      });
      const written = await publishOutputs(out, entries, context.identity.path);
      report.data.files = written;
      return { report, text: text + "\n\n" + written.join("\n") };
    },
    options,
  );
}

type Snapshot = NonNullable<Comparison["edited"]>;
interface ComparedPackages {
  saved: Extract<Comparison["saved"], { schemaVersion: 2 }>;
  edited: Snapshot;
  automatic: Snapshot;
}
async function comparisonOutputs(
  api: Api,
  result: Comparison,
  { saved, edited, automatic }: ComparedPackages,
) {
  const text = api.formatPackageComparison(result);
  const evidence = (snapshot: Snapshot) => ({
    frames: snapshot.frames,
    evidence: snapshot.evidence,
    tune: snapshot.tune,
  });
  const json = {
    ...result,
    schemaVersion: 1,
    kind: "comparison",
    edited: evidence(edited),
    automatic: evidence(automatic),
  };
  const entries: Record<string, string | Uint8Array> = {
    "comparison.txt": text + "\n",
    "comparison.json": JSON.stringify(json, null, 2) + "\n",
    "saved.mid": Uint8Array.from(saved.midiBytes),
  };
  for (const [name, snapshot] of [
    ["edited", edited],
    ["automatic", automatic],
  ] as const)
    entries[`${name}.mid`] = new Uint8Array(
      await (await api.encodeTuneMidi(snapshot.tune)).arrayBuffer(),
    );
  return { entries, text };
}
