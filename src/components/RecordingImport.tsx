import type { TuneImportMode, ImportDisposition } from "../recording-package-types";
import { Link } from "react-router";
import { PopoverContent } from "../UI/Popover";
import { Button } from "../UI/Primitives";
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
type CandidateOptions = { tuneMode?: TuneImportMode; disposition?: ImportDisposition };
function WavImportOptions({
  candidate,
  onOptions,
}: {
  candidate: ImportCandidate;
  onOptions(options: CandidateOptions): void;
}) {
  return (
    <>
      {candidate.package?.metadata.schemaVersion === 2 && !candidate.error && (
        <label>
          Melody{" "}
          <select
            aria-label={`Melody for ${candidate.file}`}
            value={candidate.tuneMode ?? "restore"}
            onChange={(event) => onOptions({ tuneMode: event.target.value as TuneImportMode })}
          >
            <option value="restore">Restore saved tune and edits</option>
            <option value="fresh">Start fresh from audio</option>
          </select>
        </label>
      )}
    </>
  );
}
function ImportItem({
  candidate,
  onOptions,
}: {
  candidate: ImportCandidate;
  onOptions(options: CandidateOptions): void;
}) {
  const { record, existing, error, tune } = candidate;
  return (
    <li className="library-import-item" data-kind={error ? "error" : existing ? "existing" : "new"}>
      <strong>{record?.name ?? tune?.name ?? candidate.file}</strong>
      {record && <RecordingSummary record={record} />}
      {tune && <TuneSummary tune={tune} />}
      <WavImportOptions candidate={candidate} onOptions={onOptions} />
      {error && <span className="library-import-error">{error}</span>}
      {existing && (
        <span>
          Already in your library <Link to={recordingPath(existing.id)}>Open</Link>
          <label>
            <input
              type="checkbox"
              checked={candidate.disposition === "copy"}
              onChange={(event) =>
                onOptions({ disposition: event.target.checked ? "copy" : "original" })
              }
            />{" "}
            Import as copy
          </label>
        </span>
      )}
    </li>
  );
}

export function RecordingImport({
  candidates,
  onConfirm,
  onCancel,
  onCandidateOptions,
}: {
  candidates: ImportCandidate[] | null;
  onConfirm(): void;
  onCancel(): void;
  onCandidateOptions(index: number, options: CandidateOptions): void;
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
          <ImportItem
            key={index}
            candidate={candidate}
            onOptions={(options) => onCandidateOptions(index, options)}
          />
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
