import { AnalysisProgress } from "./AnalysisProgress";
import { useAnalysisStatus } from "../hooks/useAnalysisStatus";
import { requestAnalysis } from "../analysis-jobs";
import { Toast } from "./Toast";
import { useEffect, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Link, useLocation, useNavigate } from "react-router";
import {
  Ban,
  ChevronRight,
  Ellipsis,
  FileAudio,
  LoaderCircle,
  Plus,
  Play,
  Square,
  Upload,
} from "lucide-react";
import { useLibrary, type Playing } from "../hooks/useLibrary";
import { importable, useWavImport, type ImportCandidate } from "../hooks/useWavImport";
import { useWavDrop } from "../hooks/useWavDrop";
import type { Recording } from "../db";
import { fmtDate } from "../ui";
import { recordingPath } from "../router";
import { Button, Panel } from "./primitives";
import { WaveformThumbnail } from "./WaveformThumbnail";

function RecordingCard({
  record,
  playing,
  onPlay,
  onDuplicate,
  onDelete,
}: {
  record: Recording;
  playing: Playing;
  onPlay(record: Recording, kind: "audio" | "midi"): void;
  onDuplicate(id: string): void;
  onDelete(record: Recording): void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const analysis = useAnalysisStatus(record);
  const waiting = analysis.status === "running" || analysis.status === "error";
  return (
    <article className="library-record">
      <WaveformThumbnail summary={record.waveform} />
      <span className="recording-icon">
        <FileAudio aria-hidden="true" />
      </span>
      <div className="recording-info">
        <h2>{record.name}</h2>
        <p>
          {fmtDate(record.createdAt)} · {record.bpm} BPM · {record.durationSec.toFixed(1)}s
        </p>
        <AnalysisProgress
          state={analysis}
          retry={() => {
            void requestAnalysis(record, true).catch(() => {});
          }}
        />
      </div>
      <div className="library-record-actions">
        {(["audio", "midi"] as const).map((kind) => {
          const active = playing?.id === record.id && playing.kind === kind;
          return (
            <Button
              key={kind}
              disabled={kind === "midi" && waiting}
              className="playback-control"
              aria-pressed={active}
              aria-label={(active ? "Stop " : "Play ") + kind + ": " + record.name}
              onClick={() => onPlay(record, kind)}
            >
              {active ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {active ? "Stop" : kind === "audio" ? "Audio" : "MIDI"}
            </Button>
          );
        })}
        <Link
          className="button recording-open"
          to={recordingPath(record.id)}
          aria-disabled={waiting}
          onClick={(event) => {
            if (waiting) event.preventDefault();
          }}
        >
          Open <ChevronRight aria-hidden="true" />
        </Link>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              className="recording-menu"
              aria-label={"Actions for " + record.name}
              title="Recording actions"
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="recording-menu-items"
            aria-label={"Actions for " + record.name}
          >
            <Button
              onClick={() => {
                setMenuOpen(false);
                onDuplicate(record.id);
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setMenuOpen(false);
                onDelete(record);
              }}
            >
              Delete
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </article>
  );
}

function ImportItem({ candidate }: { candidate: ImportCandidate }) {
  const { record, existing, error } = candidate;
  return (
    <li className="library-import-item" data-kind={error ? "error" : existing ? "existing" : "new"}>
      <strong>{record?.name ?? candidate.file}</strong>
      {record && (
        <span>
          {fmtDate(record.createdAt)} · {record.bpm} BPM · {record.beatsPerBar}/4 · diapason{" "}
          {record.imported?.metadata.provenance.build.version ?? "unknown"}
        </span>
      )}
      {error && <span className="library-import-error">{error}</span>}
      {existing && (
        <span>
          Already in your library <Link to={recordingPath(existing.id)}>Open</Link>
        </span>
      )}
    </li>
  );
}

function ImportPopover({
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

const HEADER = ".workstation-header";
/** The drop area covers the page below the header, which is not a drop target. */
const belowHeader = () =>
  (document.querySelector(HEADER)?.getBoundingClientRect().bottom ?? 0) + 12;

export function Library() {
  const {
    recordings,
    storage,
    playing,
    reload,
    togglePlay,
    duplicate,
    remove,
    notice,
    dismissNotice,
    showNotice,
  } = useLibrary();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const name: unknown = location.state?.deletedRecording;
    if (typeof name !== "string") return;
    showNotice({ kind: "success", message: `Deleted “${name}”` });
    void navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, showNotice]);
  const wavImport = useWavImport(reload, showNotice);
  const dropState = useWavDrop((files) => void wavImport.offer(files), HEADER);
  return (
    <div id="view-library">
      {dropState !== "idle" && (
        <div className="library-drop-area" data-kind={dropState} style={{ top: belowHeader() }}>
          {dropState === "reject" ? <Ban aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {dropState === "reject"
            ? "Only WAV files can be imported"
            : "Drop diapason WAVs to import"}
        </div>
      )}
      <Popover
        open={!!wavImport.candidates}
        onOpenChange={(open) => {
          if (!open) wavImport.cancel();
        }}
      >
        <PopoverAnchor asChild>
          <div className="library-heading">
            <h1>Your recordings</h1>
            <div className="library-heading-actions">
              <label className="button" aria-busy={wavImport.busy}>
                {wavImport.busy ? (
                  <LoaderCircle className="library-import-spinner" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                <span className="library-action-label">Import</span>
                <input
                  className="sr-only"
                  type="file"
                  disabled={wavImport.busy}
                  aria-label="Import WAV"
                  accept=".wav,audio/wav"
                  multiple
                  onChange={(event) => {
                    const files = [...(event.currentTarget.files ?? [])];
                    event.currentTarget.value = "";
                    if (files.length) void wavImport.offer(files);
                  }}
                />
              </label>
              {wavImport.busy && (
                <span className="sr-only" role="status">
                  Importing WAV…
                </span>
              )}
              <Link className="button primary" to="/new" aria-label="New recording">
                <Plus aria-hidden="true" /> <span className="library-action-label">New</span>
              </Link>
            </div>
          </div>
        </PopoverAnchor>
        <ImportPopover
          candidates={wavImport.candidates}
          onConfirm={() => void wavImport.confirm()}
          onCancel={wavImport.cancel}
        />
      </Popover>
      {recordings.length ? (
        <div className="recordings">
          {recordings.map((record) => (
            <RecordingCard
              key={record.id}
              record={record}
              playing={playing}
              onPlay={togglePlay}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          ))}
        </div>
      ) : (
        <Panel title="Your library is empty">
          <p className="empty-library-copy">
            No recordings yet. Record a melody, refine the notes, and export it to MIDI.
          </p>
        </Panel>
      )}
      <p className="library-storage">{storage}</p>
      <Toast notice={notice} onDismiss={dismissNotice} />
    </div>
  );
}
