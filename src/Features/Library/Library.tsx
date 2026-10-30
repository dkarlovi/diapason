import { TuneShareLink } from "../../Studio/TuneShareLink";
import { RecordingImport } from "./RecordingImport";
import { useTuneShare } from "../../Studio/useTuneShare";
import { AnalysisProgress } from "../../Studio/AnalysisProgress";
import { useAnalysisStatus } from "../../Studio/useAnalysisStatus";
import { requestAnalysis } from "../../Analysis/AnalysisJobs";
import { Toast } from "../../UI/Toast";
import { useEffect, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../../UI/Popover";
import { Link, useLocation, useNavigate } from "react-router";
import {
  Ban,
  ChevronRight,
  Ellipsis,
  FileAudio,
  FileMusic,
  LoaderCircle,
  Plus,
  Play,
  Square,
  Upload,
} from "lucide-react";
import { useLibrary, type Playing } from "./useLibrary";
import { useRecordingImport } from "./useRecordingImport";
import { useWavDrop } from "./useWavDrop";
import type { Recording } from "../../Recording/Recording.type";
import { fmtDate } from "../../UI/Format";
import { recordingPath } from "../../Routing/Routes";
import { Button, Panel } from "../../UI/Primitives";
import { WaveformThumbnail } from "./WaveformThumbnail";

function RecordingCard({
  record,
  playing,
  onPlay,
  onDuplicate,
  onDelete,
  onShare,
  onMidi,
  sharing,
}: {
  record: Recording;
  playing: Playing;
  onPlay(record: Recording, kind: "audio" | "midi"): void;
  onDuplicate(id: string): void;
  onDelete(record: Recording): void;
  onShare(id: string): void;
  onMidi(id: string): void;
  sharing: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const analysis = useAnalysisStatus(record);
  const waiting = analysis.status === "running" || analysis.status === "error";
  const SourceIcon = record.noteSource ? FileMusic : FileAudio;
  return (
    <article className="library-record" data-source={record.noteSource ? "notes" : "audio"}>
      <WaveformThumbnail summary={record.waveform} />
      <span
        className="recording-icon"
        role="img"
        aria-label={record.noteSource ? "Tune without audio" : "Audio recording"}
      >
        <SourceIcon aria-hidden="true" />
      </span>
      <div className="recording-info">
        <h2>{record.name}</h2>
        <p>
          {fmtDate(record.createdAt)} · {record.bpm} BPM · {record.durationSec.toFixed(1)}s
        </p>
        <AnalysisProgress
          state={analysis}
          retry={() => {
            if (!record.noteSource) void requestAnalysis(record, true).catch(() => {});
          }}
        />
      </div>
      <div className="library-record-actions">
        {(["audio", "midi"] as const).map((kind) => {
          const active = playing?.id === record.id && playing.kind === kind;
          return (
            <Button
              key={kind}
              disabled={kind === "midi" ? waiting : !!record.noteSource}
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
              disabled={sharing || waiting}
              onClick={() => {
                setMenuOpen(false);
                onShare(record.id);
              }}
            >
              Copy tune link
            </Button>
            <Button
              disabled={sharing || waiting}
              onClick={() => {
                setMenuOpen(false);
                onMidi(record.id);
              }}
            >
              Download MIDI
            </Button>
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
  const share = useTuneShare(showNotice);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const name: unknown = location.state?.deletedRecording;
    if (typeof name !== "string") return;
    showNotice({ kind: "success", message: `Deleted “${name}”` });
    void navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate, showNotice]);
  const recordingImport = useRecordingImport(reload, showNotice);
  const cancelImport = () => {
    recordingImport.cancel();
  };
  const dropState = useWavDrop((files) => void recordingImport.offer(files), HEADER);
  return (
    <div id="view-library">
      {dropState !== "idle" && (
        <div className="library-drop-area" data-kind={dropState} style={{ top: belowHeader() }}>
          {dropState === "reject" ? <Ban aria-hidden="true" /> : <Upload aria-hidden="true" />}
          {dropState === "reject"
            ? "Only Diapason WAV and MIDI files can be imported"
            : "Drop Diapason WAV or MIDI files to import"}
        </div>
      )}
      <Popover
        open={!!recordingImport.candidates}
        onOpenChange={(open) => {
          if (!open) cancelImport();
        }}
      >
        <PopoverAnchor asChild>
          <div className="library-heading">
            <h1>Your recordings</h1>
            <div className="library-heading-actions">
              <label className="button" aria-busy={recordingImport.busy}>
                {recordingImport.busy ? (
                  <LoaderCircle className="library-import-spinner" aria-hidden="true" />
                ) : (
                  <Upload aria-hidden="true" />
                )}
                <span className="library-action-label">Import</span>
                <input
                  className="sr-only"
                  type="file"
                  disabled={recordingImport.busy}
                  aria-label="Import WAV or MIDI"
                  accept=".wav,.mid,.midi,audio/wav,audio/midi"
                  multiple
                  onChange={(event) => {
                    const files = [...(event.currentTarget.files ?? [])];
                    event.currentTarget.value = "";
                    if (files.length) void recordingImport.offer(files);
                  }}
                />
              </label>
              {recordingImport.busy && (
                <span className="sr-only" role="status">
                  Inspecting recordings…
                </span>
              )}
              <Link className="button primary" to="/new" aria-label="New recording">
                <Plus aria-hidden="true" /> <span className="library-action-label">New</span>
              </Link>
            </div>
          </div>
        </PopoverAnchor>
        <RecordingImport
          onCandidateOptions={recordingImport.setCandidateOptions}
          candidates={recordingImport.candidates}
          onConfirm={() => {
            void recordingImport.confirm();
          }}
          onCancel={cancelImport}
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
              onShare={(id) => void share.copyLink(id)}
              onMidi={(id) => void share.downloadMidi(id)}
              sharing={share.busy}
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
      <TuneShareLink link={share.fallbackLink} onClose={share.clearFallback} />
      <p className="library-storage">{storage}</p>
      <Toast notice={notice} onDismiss={dismissNotice} />
    </div>
  );
}
