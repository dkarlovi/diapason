import { Link } from "react-router";
import { ChevronRight, Ellipsis, FileAudio, Plus, Play, Square } from "lucide-react";
import { useLibrary, type Playing } from "../hooks/useLibrary";
import type { Recording } from "../db";
import { fmtDate } from "../ui";
import { recordingPath } from "../router";
import { Button, Panel } from "./primitives";
import { WaveformThumbnail } from "./WaveformThumbnail";

function closeRecordingMenu(control: HTMLElement) {
  const menu = control.closest("details");
  menu?.removeAttribute("open");
  menu?.querySelector("summary")?.focus();
}

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
      </div>
      <div className="library-record-actions">
        {(["audio", "midi"] as const).map((kind) => {
          const active = playing?.id === record.id && playing.kind === kind;
          return (
            <Button
              key={kind}
              aria-pressed={active}
              aria-label={(active ? "Stop " : "Play ") + kind + ": " + record.name}
              onClick={() => onPlay(record, kind)}
            >
              {active ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}
              {kind === "audio" ? "Audio" : "MIDI"}
            </Button>
          );
        })}
        <Link className="button recording-open" to={recordingPath(record.id)}>
          Open <ChevronRight aria-hidden="true" />
        </Link>
        <details
          className="recording-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeRecordingMenu(event.currentTarget);
          }}
        >
          <summary aria-label={"Actions for " + record.name} title="Recording actions">
            <Ellipsis aria-hidden="true" />
          </summary>
          <div className="recording-menu-items">
            <Button
              onClick={(event) => {
                closeRecordingMenu(event.currentTarget);
                onDuplicate(record.id);
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              onClick={(event) => {
                closeRecordingMenu(event.currentTarget);
                onDelete(record);
              }}
            >
              Delete
            </Button>
          </div>
        </details>
      </div>
    </article>
  );
}

export function Library() {
  const { recordings, storage, playing, togglePlay, duplicate, remove } = useLibrary();
  return (
    <div id="view-library">
      <div className="library-heading">
        <h1>Your recordings</h1>
        <Link className="button primary" to="/new">
          <Plus aria-hidden="true" /> New recording
        </Link>
      </div>
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
    </div>
  );
}
