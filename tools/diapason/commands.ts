import { errorReport, type CliError } from "./errors.ts";
import { registerQueries, type CommandContext, type OutputFormat } from "./queries.ts";
import { Command, Option } from "commander";
import { readFile } from "node:fs/promises";
import { digest } from "./identity.ts";
import { createStageStore } from "./cache.ts";
import { renderReport } from "./render.ts";
import { inspectRecording, verifyRecording, compareRecording, withRecording } from "./handlers.ts";
import type { CliResult } from "./handlers.ts";

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}
interface GlobalOptions {
  format?: string;
  json?: boolean;
  cacheDir?: string;
  cache?: boolean;
  color: string;
}
function preferredFormat(argv: string[]) {
  // A permissive Commander pass selects error serialization even for malformed commands.
  try {
    const format = new Command()
      .allowUnknownOption()
      .allowExcessArguments()
      .exitOverride()
      .option("--format <format>")
      .option("--json")
      .configureOutput({ writeOut: () => {}, writeErr: () => {} });
    format.parse(argv, { from: "user" });
    return format.opts().json ? "json" : (format.opts().format ?? "text");
  } catch {
    /* Main parser reports all usage errors. */
  }
  return "text";
}
export async function runCli(
  argv: string[],
  io: CliIo = {
    stdout: (s) => void process.stdout.write(s),
    stderr: (s) => void process.stderr.write(s),
  },
): Promise<number> {
  const selectedFormat = preferredFormat(argv);
  const program = new Command()
    .name("bin/diapason")
    .description("Browse and verify a diapason recording WAV")
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: () => {} })
    .addOption(
      new Option("--format <format>", "report format").choices(["text", "markdown", "json"]),
    )
    .option("--json", "alias for --format json")
    .option("--cache-dir <directory>", "private disposable computation cache")
    .option("--no-cache", "bypass cache reads and writes")
    .addOption(
      new Option("--color <mode>", "terminal coloring")
        .choices(["auto", "always", "never"])
        .default("auto"),
    );
  const runtimeOptions: CommandContext["runtimeOptions"] = () => ({
    ...program.opts<GlobalOptions>(),
    diagnostic: (message: string) => io.stderr(message + "\n"),
  });
  let code = 0;
  const outputOptions = (): OutputFormat => {
    const opts = program.opts<GlobalOptions>();
    if (opts.json && opts.format && opts.format !== "json")
      throw new Error("--json conflicts with --format.");
    return {
      format: opts.json ? "json" : (opts.format ?? "text"),
      color: opts.color,
      width: process.stdout.columns ?? 80,
    };
  };
  const emit = (result: CliResult, format: OutputFormat) => {
    if ("raw" in result) {
      io.stdout(JSON.stringify(result.raw, null, 2) + "\n");
      return;
    }
    io.stdout(
      (result.text && format.format === "text"
        ? result.text
        : renderReport(result.report, format)) + "\n",
    );
    code = result.report.overall === "fail" ? 2 : result.report.overall === "mismatch" ? 1 : 0;
  };
  program
    .command("inspect <wav>")
    .description("Executive summary with applicable verification checks")
    .option("--raw", "return original package JSON")
    .action(async (file: string, options: { raw?: boolean }) => {
      const format = outputOptions();
      if (options.raw && format.format !== "json") throw new Error("--raw requires --format json.");
      emit(
        await inspectRecording(file, { ...runtimeOptions(), ...options }, format.format),
        format,
      );
    });
  program
    .command("verify <wav>")
    .description("Detailed integrity, replay, import and MIDI checks")
    .action(async (file: string) => {
      const format = outputOptions();
      emit(await verifyRecording(file, runtimeOptions()), format);
    });
  program
    .command("compare <wav>")
    .description("Compare saved, edited replay and automatic results")
    .option("--out <directory>", "write complete comparison reports and MIDI to a new destination")
    .action(async (file: string, options: { out?: string }) => {
      const format = outputOptions();
      emit(await compareRecording(file, { ...runtimeOptions(), ...options }), format);
    });
  registerQueries(program, { outputOptions, runtimeOptions, emit, withRecording });
  const cache = program
    .command("cache")
    .description("Inspect or clear disposable cached computations");
  for (const action of ["status", "clear"])
    cache.command(`${action} [wav]`).action(async (wav: string | undefined) => {
      const format = outputOptions();
      const options = runtimeOptions();
      const store = createStageStore({
        directory: options.cacheDir,
        scope: wav ? digest(await readFile(wav)) : undefined,
        enabled: options.cache !== false,
        diagnostic: options.diagnostic,
      });
      if (action === "clear") await store.clear();
      emit(
        {
          report: {
            schemaVersion: 1,
            kind: `cache.${action}`,
            input: null,
            view: null,
            execution: null,
            scope: { total: 1, returned: 1, offset: 0, limit: 20, omitted: 0 },
            overall: "pass",
            findings: [],
            data: await store.status(),
            nextSteps: [],
          },
        },
        format,
      );
    });
  try {
    await program.parseAsync(argv, { from: "user" });
    return code;
  } catch (caught) {
    const error = caught as CliError;
    if (error.code === "commander.helpDisplayed" || error.code === "commander.help") return 0;
    const report = errorReport(error);
    if (selectedFormat === "json" || selectedFormat === "markdown")
      io.stdout(renderReport(report, { format: selectedFormat, color: "never" }) + "\n");
    else io.stderr(error.message + (error.path ? ` (${error.path}; ${error.check})` : "") + "\n");
    return 2;
  }
}
