import { Option } from "commander";
export function registerQueries(program, { outputOptions, runtimeOptions, emit, withRecording }) {
  for (const kind of ["notes", "controls", "stages"]) {
    const command = program
      .command(`${kind} <wav>`)
      .description(`Browse ${kind} in a full-context evidence view`)
      .addOption(
        new Option("--view <view>", "evidence view")
          .choices(["saved", "replay", "automatic"])
          .default("saved"),
      )
      .option("--all", "return every selected row")
      .option("--offset <offset>", "skip selected rows", Number)
      .option("--limit <limit>", "maximum returned rows", Number);
    if (kind !== "controls")
      command
        .option("--note <id>", "note ID in the selected view", Number)
        .option("--time <start:end>", "absolute source seconds");
    if (kind === "notes")
      command
        .option("--corrected", "only explicit pitch corrections")
        .option("--muted", "only muted notes")
        .option("--changed", "only changes from saved observations")
        .option("--similar-to <id>", "continuous-pitch similarity seed", Number)
        .option("--cents <cents>", "similarity radius", Number);
    command.action(async (file, options) => {
      const format = outputOptions();
      const query = { ...options };
      if (typeof options.time === "string") {
        const parts = options.time.split(":");
        if (parts.length !== 2 || parts.some((p) => p.trim() === ""))
          throw new Error("Time selector requires start:end in seconds.");
        query.time = { start: Number(parts[0]), end: Number(parts[1]) };
        if (!Object.values(query.time).every(Number.isFinite))
          throw new Error("Time selector requires finite source seconds.");
      }
      const result = await withRecording(
        file,
        (runtime) => queryRecording(runtime, kind, options.view, query),
        runtimeOptions(),
      );
      for (const step of result.report.nextSteps) {
        const index = step.argv.indexOf("--format");
        if (index >= 0) step.argv[index + 1] = format.format;
      }
      emit(result, format);
    });
  }
}

async function queryRecording({ context, api }, kind, name, query) {
  try {
    const view = await api.getView(context, name);
    return { report: await runQuery(api, context, kind, view, query) };
  } catch (error) {
    if (error.code !== "view.unavailable") throw error;
    return {
      report: api.makeReport(kind, context.identity, { unavailable: error.message }, "incomplete"),
    };
  }
}
async function runQuery(api, context, kind, view, query) {
  if (kind === "notes") return api.queryNotes(view, query);
  if (kind === "controls") return api.queryControls(context, view, query);
  return api.queryStages(await api.getView(context, "saved"), view, query);
}
