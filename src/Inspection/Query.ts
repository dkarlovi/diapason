import type { SourceRange } from "../note-edits";
import { makeReport } from "./Report";
import type { EvidenceView } from "./Views";
export interface SourceSelector {
  note?: number;
  time?: SourceRange;
}
export interface PageOptions {
  offset?: number;
  limit?: number;
  all?: boolean;
}
function validateSelector(selector: SourceSelector) {
  if (selector.note !== undefined && selector.time !== undefined)
    throw new Error("Choose --note or --time, not both.");
  if (selector.note !== undefined && (!Number.isSafeInteger(selector.note) || selector.note < 1))
    throw new Error("Invalid note ID.");
  const time = selector.time;
  if (
    time &&
    (![time.start, time.end].every(Number.isFinite) || time.start < 0 || time.end <= time.start)
  )
    throw new Error("Invalid absolute time range; use start:end in seconds.");
}
export function selectorRange(
  view: EvidenceView,
  selector: SourceSelector,
): SourceRange | undefined {
  validateSelector(selector);
  if (selector.note === undefined) return selector.time;
  const item = view.evidence.stages.items.find((item) => item.id === selector.note);
  if (!item) throw new Error(`Note ${selector.note} is unavailable in the ${view.name} view.`);
  return item.source;
}
export const overlaps = (a: SourceRange, b: SourceRange) => a.start < b.end && b.start < a.end;
export function pagedReport<T>(
  view: EvidenceView,
  kind: string,
  rows: T[],
  options: PageOptions,
  argv: string[] = [],
) {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 20;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1)
    throw new Error("Pagination requires a nonnegative offset and a positive limit.");
  if (options.all && (options.offset !== undefined || options.limit !== undefined))
    throw new Error("--all conflicts with --offset/--limit.");
  const selected = options.all ? rows : rows.slice(offset, offset + limit);
  const report = makeReport(kind, view.input, {
    rows: selected,
    runKey: view.runKey,
    provenance: view.provenance,
  });
  report.view = view.name;
  report.execution = view.execution;
  report.scope = {
    total: rows.length,
    returned: selected.length,
    offset: options.all ? 0 : offset,
    limit: options.all ? rows.length : limit,
    omitted: rows.length - selected.length,
  };
  if (!options.all && offset + selected.length < rows.length)
    report.nextSteps.push({
      code: `${kind}.next-page`,
      reason: "Read the next page of the same selection",
      argv: [
        "bin/diapason",
        kind,
        view.input.path,
        "--view",
        view.name,
        ...argv,
        "--offset",
        String(offset + selected.length),
        "--limit",
        String(limit),
        "--format",
        "markdown",
      ],
    });
  return report;
}
export function selectorArgv(selector: SourceSelector): string[] {
  if (selector.note !== undefined) return ["--note", String(selector.note)];
  return selector.time ? ["--time", `${selector.time.start}:${selector.time.end}`] : [];
}
