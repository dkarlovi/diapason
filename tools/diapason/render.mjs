import { queryRows } from "./query-render.mjs";
import { Chalk } from "chalk";
import Table from "cli-table3";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTableToMarkdown } from "mdast-util-gfm-table";
import { quote } from "shell-quote";
export const commandText = (argv) => quote(argv);
const text = (value) => ({ type: "text", value: String(value) });
const paragraph = (value) => ({ type: "paragraph", children: [text(value)] });
const heading = (value, depth = 2) => ({ type: "heading", depth, children: [text(value)] });
const display = (value) =>
  value === null
    ? "unavailable"
    : typeof value === "number"
      ? String(Number(value.toFixed(3)))
      : String(value);
function inspectRows(data) {
  return [
    ["audio", `${display(data.durationSeconds)} s · ${data.sampleRate} Hz mono PCM16`],
    [
      "tune",
      `${data.bpm} BPM · ${data.beatsPerBar}/4 · ${data.key ?? "key unavailable"} · tuning ${display(data.tuningCents)} cents`,
    ],
    [
      "notes",
      `${data.noteCount ?? "?"} saved · ${data.pitchCorrections ?? "?"} corrections · ${data.muteCount ?? "?"} mutes · ${data.frameCount ?? "?"} frames`,
    ],
    [
      "quality",
      `${display(data.voicedPercent)}% voiced · clarity ${display(data.medianClarity)} · clipped ${display(data.clipped)}`,
    ],
    ["playback", data.playback ?? "unavailable"],
    ["identity", `schema ${data.schema} · current/export build ${data.build ?? "unchecked"}`],
  ];
}
function summaryRows(data, kind) {
  if (kind === "inspect" && data.durationSeconds !== undefined) return inspectRows(data);
  return Object.entries(data)
    .filter(
      ([key, value]) =>
        key !== "name" &&
        (value === null || ["number", "string", "boolean"].includes(typeof value)),
    )
    .map(([key, value]) => [key.replace(/([A-Z])/g, " $1").toLowerCase(), display(value)]);
}
function reportRows(report, data) {
  if (!data.rows) return summaryRows(data, report.kind);
  return [
    ["view", `${report.view} · run ${data.runKey}`],
    ["input", report.input?.path ?? "unavailable"],
    [
      "selection",
      `${report.scope.returned} of ${report.scope.total}; ${report.scope.omitted} omitted`,
    ],
    ...queryRows(report.kind, data.rows),
  ];
}
function checkRow(check, detailed) {
  if (!detailed) return [check.id, check.status];
  const delta = check.difference?.maxNumericDelta;
  const suffix = delta?.absolute ? ` (max delta ${delta.absolute} at ${delta.path})` : "";
  return [check.id, `${check.status}: ${check.reason}${suffix}`];
}
const scopeMessage = (scope) =>
  `${scope.returned} of ${scope.total} results; ${scope.omitted} omitted.`;
function errorMessage(error) {
  return `${error.code}: ${error.message}${error.path ? ` (${error.path}; ${error.check})` : ""}`;
}
function markdownTable(rows) {
  return {
    type: "table",
    align: [null, null],
    children: [["Metric / check", "Value / result"], ...rows].map((row) => ({
      type: "tableRow",
      children: row.map((value) => ({ type: "tableCell", children: [text(value)] })),
    })),
  };
}
function renderMarkdown(report, { title, rows, data }) {
  const children = [heading(title), paragraph(`Result: ${report.overall}`)];
  if (rows.length) children.push(markdownTable(rows));
  for (const finding of report.findings)
    children.push(paragraph(`${finding.severity}: ${finding.message}`));
  if (report.scope.omitted) children.push(paragraph(scopeMessage(report.scope)));
  if (report.nextSteps.length) children.push(heading("Next steps", 3));
  for (const next of report.nextSteps)
    children.push(paragraph(next.reason), {
      type: "code",
      lang: "sh",
      value: commandText(next.argv),
    });
  if (data.error) children.push(paragraph(errorMessage(data.error)));
  return toMarkdown({ type: "root", children }, { extensions: [gfmTableToMarkdown()] });
}
function colorLevel(color) {
  if (color === "never") return 0;
  if (color === "always") return 1;
  if (process.env.NO_COLOR !== undefined || !process.stdout.isTTY) return 0;
  return undefined;
}
function textTable(rows, width) {
  const firstWidth = Math.min(20, Math.max(8, Math.floor(width / 3)));
  const table = new Table({
    style: { head: [], border: [], "padding-left": 0, "padding-right": 1 },
    chars: {
      top: "",
      "top-mid": "",
      "top-left": "",
      "top-right": "",
      bottom: "",
      "bottom-mid": "",
      "bottom-left": "",
      "bottom-right": "",
      left: "",
      "left-mid": "",
      mid: "",
      "mid-mid": "",
      right: "",
      "right-mid": "",
      middle: " ",
    },
    colWidths: [firstWidth, Math.max(10, width - firstWidth - 3)],
    wordWrap: true,
  });
  table.push(...rows);
  return table.toString();
}
function renderText(report, { color, width, title, rows, data }) {
  const level = colorLevel(color);
  const chalk = new Chalk(level === undefined ? {} : { level });
  const styles = { fail: chalk.red, pass: chalk.green };
  const label = (styles[report.overall] ?? chalk.yellow)(report.overall);
  return [
    chalk.bold(title),
    `Result: ${label}`,
    rows.length ? textTable(rows, width) : "",
    ...report.findings.map((f) => `${f.severity}: ${f.message}`),
    ...(report.scope.omitted ? [scopeMessage(report.scope)] : []),
    ...(data.error ? [errorMessage(data.error)] : []),
    ...report.nextSteps.flatMap((next) => [next.reason, `  ${commandText(next.argv)}`]),
  ]
    .filter(Boolean)
    .join("\n");
}
export function renderReport(report, { format = "text", color = "auto", width = 80 } = {}) {
  if (format === "json") return JSON.stringify(report, null, 2);
  const data = report.data ?? {};
  const rows = [
    ...reportRows(report, data),
    ...(data.checks ?? []).map((check) => checkRow(check, report.kind === "verify")),
  ];
  const context = { data, rows, title: data.name ?? `diapason ${report.kind}`, color, width };
  return format === "markdown" ? renderMarkdown(report, context) : renderText(report, context);
}
