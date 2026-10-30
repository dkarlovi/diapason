import { resolve } from "node:path";
import { openInvestigation } from "./runtime.mjs";
import { publishOutputs } from "./files.mjs";
import { probeWav } from "./probe.mjs";
export async function withRecording(file, operation, options = {}) {
  const runtime = await openInvestigation(file, options);
  let value;
  try {
    value = await operation(runtime);
  } finally {
    try {
      await runtime.assertUnchanged();
    } finally {
      await runtime.close();
    }
  }
  const checks = value?.report?.data?.checks;
  if (Array.isArray(checks)) {
    checks.push({
      id: "source.non-mutation",
      status: "pass",
      reason: "Input WAV SHA-256 is unchanged after this invocation.",
    });
    value.report.overall = runtime.api.overallChecks(checks);
    value.report.scope = {
      total: checks.length,
      returned: checks.length,
      offset: 0,
      limit: 20,
      omitted: 0,
    };
  }
  return value;
}
async function verified(runtime) {
  const report = await runtime.api.verifyPackage(runtime.context, { portable: false });
  report.data.checks.push(await probeWav(runtime.context.identity.path, runtime.context.identity));
  report.overall = runtime.api.overallChecks(report.data.checks);
  return report;
}
export async function inspectRecording(file, options, format) {
  return withRecording(
    file,
    async (runtime) => {
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
export async function verifyRecording(file, options = {}) {
  return withRecording(file, async (runtime) => ({ report: await verified(runtime) }), options);
}
export async function compareRecording(file, options) {
  const out = options.out ? resolve(options.out) : null;
  return withRecording(
    file,
    async ({ context, api }) => {
      const { result, provenance } = await api.computeComparison(context);
      if (!result.edited || !result.automatic || result.saved.schemaVersion !== 2)
        throw new Error(result.difference ?? "No saved melody baseline.");
      const report = api.makeReport(
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
      const { entries, text } = await comparisonOutputs(api, result);
      const written = await publishOutputs(out, entries, context.identity.path);
      report.data.files = written;
      return { report, text: text + "\n\n" + written.join("\n") };
    },
    options,
  );
}

async function comparisonOutputs(api, result) {
  const text = api.formatPackageComparison(result);
  const evidence = (snapshot) => ({
    frames: snapshot.frames,
    evidence: snapshot.evidence,
    tune: snapshot.tune,
  });
  const json = {
    ...result,
    schemaVersion: 1,
    kind: "comparison",
    edited: evidence(result.edited),
    automatic: evidence(result.automatic),
  };
  const entries = {
    "comparison.txt": text + "\n",
    "comparison.json": JSON.stringify(json, null, 2) + "\n",
    "saved.mid": Uint8Array.from(result.saved.midiBytes),
  };
  for (const [name, snapshot] of [
    ["edited", result.edited],
    ["automatic", result.automatic],
  ])
    entries[`${name}.mid`] = new Uint8Array(
      await (await api.encodeTuneMidi(snapshot.tune)).arrayBuffer(),
    );
  return { entries, text };
}
