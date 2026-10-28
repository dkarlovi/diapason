import { Link } from "react-router";
import { PopoverContent } from "./ui/popover";
import { Button } from "./primitives";
import { fmtDate } from "../ui";
import { recordingPath } from "../router";
import { importable, type ImportCandidate } from "../hooks/useRecordingImport";
function RecordingSummary({ record }: { record: NonNullable<ImportCandidate["record"]> }) {
  return (
    <span>
      {fmtDate(record.createdAt)} · {record.bpm} BPM · {record.beatsPerBar}/4 · diapason{" "}
      {record.imported?.metadata.provenance.build.version ?? "unknown"}
    </span>
  );
}
function TuneSummary({ tune }: { tune: NonNullable<ImportCandidate["tune"]> }) {
  return (
    <span>
      {tune.bpm} BPM · {tune.beatsPerBar}/4 · {(tune.durationMs / 1000).toFixed(1)}s · No original
      audio
    </span>
  );
}
function ImportItem({ candidate }: { candidate: ImportCandidate }) {
  const { record, existing, error, tune } = candidate;
  return (
    <li className="library-import-item" data-kind={error ? "error" : existing ? "existing" : "new"}>
      <strong>{record?.name ?? tune?.name ?? candidate.file}</strong>
      {record && <RecordingSummary record={record} />}
      {tune && <TuneSummary tune={tune} />}
      {error && <span className="library-import-error">{error}</span>}
      {existing && (
        <span>
          Already in your library <Link to={recordingPath(existing.id)}>Open</Link>
        </span>
      )}
    </li>
  );
}

export function RecordingImport({
  candidates,
  onConfirm,
  onCancel,
}: {
  candidates: ImportCandidate[] | null;
  onConfirm(): void;
  onCancel(): void;
}) {
  const count = importable(candidates ?? []).length;
  return (
    <PopoverContent
      className="library-import"
      aria-label="Import recordings"
      onOpenAutoFocus={(event) => {
        // Land on the action, not the first link in the list.
        event.preventDefault();
        const actions = (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>(
          ".library-import-actions button:not(:disabled)",
        );
        actions[actions.length - 1]?.focus();
      }}
    >
      <h2>Import recordings</h2>
      <ul>
        {candidates?.map((candidate, index) => (
          <ImportItem key={index} candidate={candidate} />
        ))}
      </ul>
      <div className="library-import-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button className="primary" disabled={!count} onClick={onConfirm}>
          {(candidates?.length ?? 0) > 1 ? `Import ${count}` : "Import"}
        </Button>
      </div>
    </PopoverContent>
  );
}
