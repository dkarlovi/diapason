import type { Api } from "./runtime.ts";

export type NoteRow = ReturnType<Api["queryNotes"]>["data"]["rows"][number];
export type ControlRow = ReturnType<Api["queryControls"]>["data"]["rows"][number];
export type StageRow = ReturnType<Api["queryStages"]>["data"]["rows"][number];
export type QueryRow = NoteRow | ControlRow | StageRow;
type Definition = ControlRow["definition"];
interface Note {
  name: string;
  midi: number;
}

const number = (value: number | null | undefined) =>
  value === null || value === undefined ? "unavailable" : String(Number(value.toFixed(3)));
const note = (value: Note | null | undefined) =>
  value ? `${value.name} (${value.midi})` : "unavailable";
const definition = (value: Definition) =>
  value.kind === "range"
    ? `${value.min}–${value.max}, step ${value.step}`
    : value.options.map((option) => option.value).join(" / ");
const source = (value: { start: number; end: number }) =>
  `${number(value.start)}–${number(value.end)} s`;
export function queryRows(kind: string, rows: readonly QueryRow[]): string[][] {
  if (kind === "notes")
    return (rows as NoteRow[]).map((row) => [
      `#${row.id} · ${source(row.source)}`,
      `measured ${number(row.measuredMidi)} MIDI; tuned ${number(row.tunedMidi)}; tuning ${number(row.tuningCents)} cents; nearest ${note(row.nearest)}; decoded ${note(row.decoded)}; final ${note(row.final)}; intent ${row.intendedMidi ?? "unapproved"}; ${row.muted ? "muted" : "audible"}`,
    ]);
  if (kind === "controls")
    return (rows as ControlRow[]).map((row) => [
      row.definition.label,
      `${definition(row.definition)}; saved ${row.savedValue}; current ${row.currentValue}; preset ${row.presetValue}; override ${row.savedOverride ? row.overrideValue : "absent"}; historical default ${row.historicalDefault?.value ?? "none"}; versions ${row.savedInterpretationVersion}/${row.currentInterpretationVersion}`,
    ]);
  if (kind === "stages")
    return (rows as StageRow[]).map((row) => [
      row.saved ? `#${row.saved.id} · ${source(row.saved.segmentation)}` : "extra source",
      `${row.kind}; current ${row.current.map((item) => `#${item.id} ${source(item.segmentation)} ${note(item.final)}`).join(", ")}; first difference ${row.firstDifferingStage ?? "none"}`,
    ]);
  return [];
}
