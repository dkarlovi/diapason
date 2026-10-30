import { matchSourceItems } from "../recording-package-comparison";
import { firstDifference } from "../diagnostics-validation";
import {
  pagedReport,
  selectorRange,
  overlaps,
  selectorArgv,
  type SourceSelector,
  type PageOptions,
} from "./query";
import type { EvidenceView } from "./views";
export interface NoteQuery extends SourceSelector, PageOptions {
  corrected?: boolean;
  muted?: boolean;
  changed?: boolean;
  similarTo?: number;
  cents?: number;
}
export function queryNotes(view: EvidenceView, query: NoteQuery) {
  const range = selectorRange(view, query);
  const stage = view.evidence.stages;
  const matches = matchSourceItems(view.savedEvidence.stages.items, stage.items);
  const all = stage.items.map((item, index) => {
    const segment = stage.segments[index];
    const measuredMidi = segment?.pitch ?? null;
    const relation = matches.find((match) => match.currentIndices.includes(index));
    const saved =
      relation?.savedIndex === null || relation?.savedIndex === undefined
        ? undefined
        : view.savedEvidence.stages.items[relation.savedIndex];
    const changed =
      !saved ||
      relation?.kind !== "matched" ||
      firstDifference(
        [saved.source, saved.note, saved.muted],
        [item.source, item.note, item.muted],
        "note",
      ) !== null;
    return {
      id: item.id,
      source: item.source,
      measuredMidi,
      tuningCents: stage.tuning * 100,
      tunedMidi: measuredMidi === null ? null : measuredMidi - stage.tuning,
      intendedMidi: item.editState.axes.includes("pitch") ? item.note.midi : null,
      tunedResidualCents:
        measuredMidi === null ? null : (measuredMidi - stage.tuning - item.note.midi) * 100,
      nearest: stage.faithful[index] ?? null,
      decoded: stage.decoded[index] ?? null,
      final: item.note,
      corrected: item.editState.axes.includes("pitch"),
      editState: item.editState,
      muted: item.muted,
      changed,
      distanceCents: null as number | null,
    };
  });
  const seed =
    query.similarTo === undefined ? undefined : all.find((row) => row.id === query.similarTo);
  if (query.similarTo !== undefined && !seed)
    throw new Error("Similarity seed note is unavailable.");
  const cents = query.cents ?? 35;
  if (!Number.isFinite(cents) || cents < 0)
    throw new Error("Similarity radius must be a finite nonnegative cents value.");
  const rows = all
    .map((row) => ({
      ...row,
      distanceCents:
        seed?.measuredMidi == null || row.measuredMidi === null
          ? null
          : Math.abs(row.measuredMidi - seed.measuredMidi) * 100,
    }))
    .filter(
      (row) =>
        (!range || overlaps(row.source, range)) &&
        (!query.corrected || row.corrected) &&
        (!query.muted || row.muted) &&
        (!query.changed || row.changed) &&
        (!seed || (row.distanceCents !== null && row.distanceCents <= cents)),
    );
  const argv = selectorArgv(query);
  for (const flag of ["corrected", "muted", "changed"] as const)
    if (query[flag]) argv.push(`--${flag}`);
  if (query.similarTo !== undefined)
    argv.push("--similar-to", String(query.similarTo), "--cents", String(cents));
  return pagedReport(view, "notes", rows, query, argv);
}
